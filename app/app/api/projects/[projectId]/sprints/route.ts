import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { sprintService, logActivity, projectService, groupService } from '@/services/index'
import { createSprintSchema } from '@paperclipai/shared'

export const maxDuration = 30

async function resolveProject(projectId: string) {
  const project = await projectService(db).getById(projectId)
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 })
  return project
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { projectId } = await params
    const project = await resolveProject(projectId)
    assertCompanyAccess(actor, project.companyId)
    const svc = sprintService(db)
    const result = await svc.list(projectId)
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { projectId } = await params
    const project = await resolveProject(projectId)
    assertCompanyAccess(actor, project.companyId)

    const body = await parseBody(req, createSprintSchema)
    const { groupId } = body as { groupId?: string }

    if (groupId) {
      const groupSvc = groupService(db)
      const isLinked = await groupSvc.isGroupInProject(groupId, projectId)
      if (!isLinked) {
        return NextResponse.json({ error: 'Group is not associated with this project' }, { status: 400 })
      }
    }

    const svc = sprintService(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprint = await svc.create(projectId, body as any)
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'sprint.created',
      entityType: 'sprint',
      entityId: sprint.id,
      details: { name: sprint.name, groupId },
    })
    return NextResponse.json(sprint, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
