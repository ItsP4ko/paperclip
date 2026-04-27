import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { projectService, logActivity } from '@/services/index'
import { createProjectWorkspaceSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = projectService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)
    const workspaces = await svc.listWorkspaces(id)
    return NextResponse.json(workspaces)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = projectService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)
    const body = await parseBody(req, createProjectWorkspaceSchema)
    const workspace = await svc.createWorkspace(id, body)
    if (!workspace) {
      return NextResponse.json({ error: 'Invalid project workspace payload' }, { status: 422 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'project.workspace_created',
      entityType: 'project',
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
        cwd: workspace.cwd,
        isPrimary: workspace.isPrimary,
      },
    })

    return NextResponse.json(workspace, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
