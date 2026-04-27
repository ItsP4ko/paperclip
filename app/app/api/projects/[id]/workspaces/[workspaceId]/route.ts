import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { projectService, logActivity } from '@/services/index'
import { updateProjectWorkspaceSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; workspaceId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id, workspaceId } = await params
    const svc = projectService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)

    const workspaceExists = (await svc.listWorkspaces(id)).some((w) => w.id === workspaceId)
    if (!workspaceExists) {
      return NextResponse.json({ error: 'Project workspace not found' }, { status: 404 })
    }

    const body = await parseBody(req, updateProjectWorkspaceSchema)
    const workspace = await svc.updateWorkspace(id, workspaceId, body)
    if (!workspace) {
      return NextResponse.json({ error: 'Invalid project workspace payload' }, { status: 422 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'project.workspace_updated',
      entityType: 'project',
      entityId: id,
      details: {
        workspaceId: workspace.id,
        changedKeys: Object.keys(body as object).sort(),
      },
    })

    return NextResponse.json(workspace)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; workspaceId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id, workspaceId } = await params
    const svc = projectService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)
    const workspace = await svc.removeWorkspace(id, workspaceId)
    if (!workspace) {
      return NextResponse.json({ error: 'Project workspace not found' }, { status: 404 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'project.workspace_deleted',
      entityType: 'project',
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
      },
    })

    return NextResponse.json(workspace)
  } catch (err) {
    return handleError(err)
  }
}
