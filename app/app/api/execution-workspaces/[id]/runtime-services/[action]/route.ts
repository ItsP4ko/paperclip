import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { projectWorkspaces } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import {
  executionWorkspaceService,
  workspaceOperationService,
  logActivity,
} from '@/services/index'
import {
  mergeExecutionWorkspaceConfig,
} from '@/services/execution-workspaces'
import { readProjectWorkspaceRuntimeConfig } from '@/services/project-workspace-runtime-config'
import {
  startRuntimeServicesForWorkspaceControl,
  stopRuntimeServicesForExecutionWorkspace,
} from '@/services/workspace-runtime'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id, action: actionRaw } = await params
    const action = actionRaw.trim().toLowerCase()

    if (action !== 'start' && action !== 'stop' && action !== 'restart') {
      return NextResponse.json({ error: 'Runtime service action not found' }, { status: 404 })
    }

    const svc = executionWorkspaceService(db)
    const workspaceOperationsSvc = workspaceOperationService(db)

    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Execution workspace not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)

    const workspaceCwd = existing.cwd
    if (!workspaceCwd) {
      return NextResponse.json({ error: 'Execution workspace needs a local path before Paperclip can manage local runtime services' }, { status: 422 })
    }

    const projectWorkspace = existing.projectWorkspaceId
      ? await db.select({
          id: projectWorkspaces.id,
          cwd: projectWorkspaces.cwd,
          repoUrl: projectWorkspaces.repoUrl,
          repoRef: projectWorkspaces.repoRef,
          defaultRef: projectWorkspaces.defaultRef,
          metadata: projectWorkspaces.metadata,
        })
          .from(projectWorkspaces)
          .where(and(eq(projectWorkspaces.id, existing.projectWorkspaceId), eq(projectWorkspaces.companyId, existing.companyId)))
          .then((rows) => rows[0] ?? null)
      : null

    const projectWorkspaceRuntime = readProjectWorkspaceRuntimeConfig(
      (projectWorkspace?.metadata as Record<string, unknown> | null) ?? null,
    )?.workspaceRuntime ?? null
    const effectiveRuntimeConfig = existing.config?.workspaceRuntime ?? projectWorkspaceRuntime ?? null

    if ((action === 'start' || action === 'restart') && !effectiveRuntimeConfig) {
      return NextResponse.json({ error: 'Execution workspace has no runtime service configuration or inherited project workspace default' }, { status: 422 })
    }

    const actorInfo = getActorInfo(actor)
    const recorder = workspaceOperationsSvc.createRecorder({
      companyId: existing.companyId,
      executionWorkspaceId: existing.id,
    })
    let runtimeServiceCount = existing.runtimeServices?.length ?? 0
    const stdout: string[] = []
    const stderr: string[] = []

    const operation = await recorder.recordOperation({
      phase: action === 'stop' ? 'workspace_teardown' : 'workspace_provision',
      command: `workspace runtime ${action}`,
      cwd: existing.cwd,
      metadata: { action, executionWorkspaceId: existing.id },
      run: async () => {
        const onLog = async (stream: 'stdout' | 'stderr', chunk: string) => {
          if (stream === 'stdout') stdout.push(chunk)
          else stderr.push(chunk)
        }

        if (action === 'stop' || action === 'restart') {
          await stopRuntimeServicesForExecutionWorkspace({
            db,
            executionWorkspaceId: existing.id,
            workspaceCwd,
          })
        }

        if (action === 'start' || action === 'restart') {
          const startedServices = await startRuntimeServicesForWorkspaceControl({
            db,
            actor: {
              id: actorInfo.agentId ?? null,
              name: actorInfo.actorType === 'user' ? 'Board' : 'Agent',
              companyId: existing.companyId,
            },
            issue: existing.sourceIssueId
              ? { id: existing.sourceIssueId, identifier: null, title: existing.name }
              : null,
            workspace: {
              baseCwd: workspaceCwd,
              source: existing.mode === 'shared_workspace' ? 'project_primary' : 'task_session',
              projectId: existing.projectId,
              workspaceId: existing.projectWorkspaceId,
              repoUrl: existing.repoUrl,
              repoRef: existing.baseRef,
              strategy: existing.strategyType === 'git_worktree' ? 'git_worktree' : 'project_primary',
              cwd: workspaceCwd,
              branchName: existing.branchName,
              worktreePath: existing.strategyType === 'git_worktree' ? workspaceCwd : null,
              warnings: [],
              created: false,
            },
            executionWorkspaceId: existing.id,
            config: { workspaceRuntime: effectiveRuntimeConfig },
            adapterEnv: {},
            onLog,
          })
          runtimeServiceCount = startedServices.length
        } else {
          runtimeServiceCount = 0
        }

        const metadata = mergeExecutionWorkspaceConfig(existing.metadata as Record<string, unknown> | null, {
          desiredState: action === 'stop' ? 'stopped' : 'running',
        })
        await svc.update(existing.id, { metadata })

        return {
          status: 'succeeded',
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          system: action === 'stop'
            ? 'Stopped execution workspace runtime services.\n'
            : action === 'restart'
              ? 'Restarted execution workspace runtime services.\n'
              : 'Started execution workspace runtime services.\n',
          metadata: { runtimeServiceCount },
        }
      },
    })

    const workspace = await svc.getById(id)
    if (!workspace) return NextResponse.json({ error: 'Execution workspace not found' }, { status: 404 })

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: `execution_workspace.runtime_${action}`,
      entityType: 'execution_workspace',
      entityId: existing.id,
      details: { runtimeServiceCount },
    })

    return NextResponse.json({ workspace, operation })
  } catch (err) {
    return handleError(err)
  }
}
