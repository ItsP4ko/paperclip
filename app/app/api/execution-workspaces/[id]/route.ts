import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { issues, projects, projectWorkspaces } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import {
  executionWorkspaceService,
  workspaceOperationService,
  logActivity,
} from '@/services/index'
import {
  mergeExecutionWorkspaceConfig,
  readExecutionWorkspaceConfig,
} from '@/services/execution-workspaces'
import { parseProjectExecutionWorkspacePolicy } from '@/services/execution-workspace-policy'
import {
  cleanupExecutionWorkspaceArtifacts,
  stopRuntimeServicesForExecutionWorkspace,
} from '@/services/workspace-runtime'
import { updateExecutionWorkspaceSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = executionWorkspaceService(db)
    const workspace = await svc.getById(id)
    if (!workspace) return NextResponse.json({ error: 'Execution workspace not found' }, { status: 404 })
    assertCompanyAccess(actor, workspace.companyId)
    return NextResponse.json(workspace)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params

    const svc = executionWorkspaceService(db)
    const workspaceOperationsSvc = workspaceOperationService(db)
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Execution workspace not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)

    const body = await parseBody(req, updateExecutionWorkspaceSchema) as Record<string, unknown>

    const patch: Record<string, unknown> = {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.cwd === undefined ? {} : { cwd: body.cwd }),
      ...(body.repoUrl === undefined ? {} : { repoUrl: body.repoUrl }),
      ...(body.baseRef === undefined ? {} : { baseRef: body.baseRef }),
      ...(body.branchName === undefined ? {} : { branchName: body.branchName }),
      ...(body.providerRef === undefined ? {} : { providerRef: body.providerRef }),
      ...(body.status === undefined ? {} : { status: body.status }),
      ...(body.cleanupReason === undefined ? {} : { cleanupReason: body.cleanupReason }),
      ...(body.cleanupEligibleAt !== undefined
        ? { cleanupEligibleAt: body.cleanupEligibleAt ? new Date(body.cleanupEligibleAt as string) : null }
        : {}),
    }

    if (body.metadata !== undefined || body.config !== undefined) {
      const requestedMetadata = body.metadata === undefined
        ? (existing.metadata as Record<string, unknown> | null)
        : (body.metadata as Record<string, unknown> | null)
      patch.metadata = body.config === undefined
        ? requestedMetadata
        : mergeExecutionWorkspaceConfig(requestedMetadata, body.config as Record<string, unknown> | null ?? null)
    }

    let workspace = existing
    let cleanupWarnings: string[] = []

    const configForCleanup = readExecutionWorkspaceConfig(
      ((patch.metadata as Record<string, unknown> | null | undefined) ?? (existing.metadata as Record<string, unknown> | null)) ?? null,
    )

    if (body.status === 'archived' && existing.status !== 'archived') {
      const readiness = await svc.getCloseReadiness(existing.id)
      if (!readiness) return NextResponse.json({ error: 'Execution workspace not found' }, { status: 404 })

      if (readiness.state === 'blocked') {
        return NextResponse.json({
          error: readiness.blockingReasons[0] ?? 'Execution workspace cannot be closed right now',
          closeReadiness: readiness,
        }, { status: 409 })
      }

      const closedAt = new Date()
      const archivedWorkspace = await svc.update(id, { ...patch, status: 'archived', closedAt, cleanupReason: null })
      if (!archivedWorkspace) return NextResponse.json({ error: 'Execution workspace not found' }, { status: 404 })
      workspace = archivedWorkspace

      if (existing.mode === 'shared_workspace') {
        await db.update(issues).set({ executionWorkspaceId: null, updatedAt: new Date() })
          .where(and(eq(issues.companyId, existing.companyId), eq(issues.executionWorkspaceId, existing.id)))
      }

      try {
        await stopRuntimeServicesForExecutionWorkspace({
          db,
          executionWorkspaceId: existing.id,
          workspaceCwd: existing.cwd,
        })

        const projectWorkspace = existing.projectWorkspaceId
          ? await db.select({ cwd: projectWorkspaces.cwd, cleanupCommand: projectWorkspaces.cleanupCommand })
              .from(projectWorkspaces)
              .where(and(eq(projectWorkspaces.id, existing.projectWorkspaceId), eq(projectWorkspaces.companyId, existing.companyId)))
              .then((rows) => rows[0] ?? null)
          : null

        const projectPolicy = existing.projectId
          ? await db.select({ executionWorkspacePolicy: projects.executionWorkspacePolicy })
              .from(projects)
              .where(and(eq(projects.id, existing.projectId), eq(projects.companyId, existing.companyId)))
              .then((rows) => parseProjectExecutionWorkspacePolicy(rows[0]?.executionWorkspacePolicy))
          : null

        const cleanupResult = await cleanupExecutionWorkspaceArtifacts({
          workspace: existing,
          projectWorkspace,
          teardownCommand: configForCleanup?.teardownCommand ?? projectPolicy?.workspaceStrategy?.teardownCommand ?? null,
          cleanupCommand: configForCleanup?.cleanupCommand ?? null,
          recorder: workspaceOperationsSvc.createRecorder({
            companyId: existing.companyId,
            executionWorkspaceId: existing.id,
          }),
        })

        cleanupWarnings = cleanupResult.warnings
        const cleanupPatch: Record<string, unknown> = {
          closedAt,
          cleanupReason: cleanupWarnings.length > 0 ? cleanupWarnings.join(' | ') : null,
        }
        if (!cleanupResult.cleaned) cleanupPatch.status = 'cleanup_failed'
        if (cleanupResult.warnings.length > 0 || !cleanupResult.cleaned) {
          workspace = (await svc.update(id, cleanupPatch)) ?? workspace
        }
      } catch (error) {
        const failureReason = error instanceof Error ? error.message : String(error)
        workspace = (await svc.update(id, { status: 'cleanup_failed', closedAt, cleanupReason: failureReason })) ?? workspace
        return NextResponse.json({ error: `Failed to archive execution workspace: ${failureReason}` }, { status: 500 })
      }
    } else {
      const updatedWorkspace = await svc.update(id, patch)
      if (!updatedWorkspace) return NextResponse.json({ error: 'Execution workspace not found' }, { status: 404 })
      workspace = updatedWorkspace
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'execution_workspace.updated',
      entityType: 'execution_workspace',
      entityId: workspace.id,
      details: {
        changedKeys: Object.keys(body).sort(),
        ...(cleanupWarnings.length > 0 ? { cleanupWarnings } : {}),
      },
    })

    return NextResponse.json(workspace)
  } catch (err) {
    return handleError(err)
  }
}
