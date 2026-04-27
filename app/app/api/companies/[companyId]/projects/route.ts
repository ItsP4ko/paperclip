import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { projectService, logActivity } from '@/services/index'
import { createProjectSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = projectService(db)
    const result = await svc.list(companyId)
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = projectService(db)

    type CreateProjectPayload = Parameters<typeof svc.create>[1] & {
      workspace?: Parameters<typeof svc.createWorkspace>[1]
    }
    const body = await parseBody(req, createProjectSchema) as CreateProjectPayload
    const { workspace, ...projectData } = body

    const project = await svc.create(companyId, projectData)
    let createdWorkspaceId: string | null = null
    if (workspace) {
      const createdWorkspace = await svc.createWorkspace(project.id, workspace)
      if (!createdWorkspace) {
        await svc.remove(project.id)
        return NextResponse.json({ error: 'Invalid project workspace payload' }, { status: 422 })
      }
      createdWorkspaceId = createdWorkspace.id
    }
    const hydratedProject = workspace ? await svc.getById(project.id) : project

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'project.created',
      entityType: 'project',
      entityId: project.id,
      details: {
        name: project.name,
        workspaceId: createdWorkspaceId,
      },
    })
    return NextResponse.json(hydratedProject ?? project, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
