import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { db } from '@/lib/db'
import { projectService, logActivity, workspaceOperationService } from '@/services/index'
import { startRuntimeServicesForWorkspaceControl, stopRuntimeServicesForProjectWorkspace } from '@/services/workspace-runtime'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; workspaceId: string; action: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id, workspaceId, action: rawAction } = await params
    const action = rawAction.trim().toLowerCase()

    if (action !== 'start' && action !== 'stop' && action !== 'restart') {
      return NextResponse.json({ error: 'Runtime service action not found' }, { status: 404 })
    }

    const svc = projectService(db)
    const project = await svc.getById(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, project.companyId)

    const workspace = project.workspaces.find((entry) => entry.id === workspaceId) ?? null
    if (!workspace) {
      return NextResponse.json({ error: 'Project workspace not found' }, { status: 404 })
    }

    const workspaceCwd = workspace.cwd
    if (!workspaceCwd) {
      return NextResponse.json(
        { error: 'Project workspace needs a local path before Paperclip can manage local runtime services' },
        { status: 422 },
      )
    }

    const runtimeConfig = workspace.runtimeConfig?.workspaceRuntime ?? null
    if ((action === 'start' || action === 'restart') && !runtimeConfig) {
      return NextResponse.json(
        { error: 'Project workspace has no runtime service configuration' },
        { status: 422 },
      )
    }

    const actorInfo = getActorInfo(actor)
    const workspaceOperations = workspaceOperationService(db)
    const recorder = workspaceOperations.createRecorder({ companyId: project.companyId })
    let runtimeServiceCount = workspace.runtimeServices?.length ?? 0
    const stdout: string[] = []
    const stderr: string[] = []

    const operation = await recorder.recordOperation({
      phase: action === 'stop' ? 'workspace_teardown' : 'workspace_provision',
      command: `workspace runtime ${action}`,
      cwd: workspace.cwd,
      metadata: {
        action,
        projectId: project.id,
        projectWorkspaceId: workspace.id,
      },
      run: async () => {
        const onLog = async (stream: 'stdout' | 'stderr', chunk: string) => {
          if (stream === 'stdout') stdout.push(chunk)
          else stderr.push(chunk)
        }

        if (action === 'stop' || action === 'restart') {
          await stopRuntimeServicesForProjectWorkspace({
            db,
            projectWorkspaceId: workspace.id,
          })
        }

        if (action === 'start' || action === 'restart') {
          const startedServices = await startRuntimeServicesForWorkspaceControl({
            db,
            actor: {
              id: actorInfo.agentId ?? null,
              name: actorInfo.actorType === 'user' ? 'Board' : 'Agent',
              companyId: project.companyId,
            },
            issue: null,
            workspace: {
              baseCwd: workspaceCwd,
              source: 'project_primary',
              projectId: project.id,
              workspaceId: workspace.id,
              repoUrl: workspace.repoUrl,
              repoRef: workspace.repoRef,
              strategy: 'project_primary',
              cwd: workspaceCwd,
              branchName: workspace.defaultRef ?? workspace.repoRef ?? null,
              worktreePath: null,
              warnings: [],
              created: false,
            },
            config: { workspaceRuntime: runtimeConfig },
            adapterEnv: {},
            onLog,
          })
          runtimeServiceCount = startedServices.length
        } else {
          runtimeServiceCount = 0
        }

        await svc.updateWorkspace(project.id, workspace.id, {
          runtimeConfig: {
            desiredState: action === 'stop' ? 'stopped' : 'running',
          },
        })

        return {
          status: 'succeeded',
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          system:
            action === 'stop'
              ? 'Stopped project workspace runtime services.\n'
              : action === 'restart'
                ? 'Restarted project workspace runtime services.\n'
                : 'Started project workspace runtime services.\n',
          metadata: {
            runtimeServiceCount,
          },
        }
      },
    })

    const updatedWorkspace =
      (await svc.listWorkspaces(project.id)).find((entry) => entry.id === workspace.id) ?? workspace

    await logActivity(db, {
      companyId: project.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: `project.workspace_runtime_${action}`,
      entityType: 'project',
      entityId: project.id,
      details: {
        projectWorkspaceId: workspace.id,
        runtimeServiceCount,
      },
    })

    return NextResponse.json({
      workspace: updatedWorkspace,
      operation,
    })
  } catch (err) {
    return handleError(err)
  }
}
