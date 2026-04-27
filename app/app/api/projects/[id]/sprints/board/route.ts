import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { db } from '@/lib/db'
import { sprintService, projectService, groupService, accessService } from '@/services/index'

export const maxDuration = 30

async function resolveProject(id: string) {
  const project = await projectService(db).getById(id)
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 })
  return project
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const project = await resolveProject(id)
    assertCompanyAccess(actor, project.companyId)

    const actorInfo = getActorInfo(actor)
    const userId = actorInfo.actorId

    const groupSvc = groupService(db)
    const access = accessService(db)

    let isAdminOrOwner = false
    if (userId && actorInfo.actorType === 'user') {
      const membership = await access.getMembership(project.companyId, 'user', userId)
      isAdminOrOwner = membership?.membershipRole === 'owner'
    }

    const projectGroups = await groupSvc.listGroupsForProject(id)
    let userGroupIds: string[] = []

    if (userId && actorInfo.actorType === 'user' && !isAdminOrOwner) {
      for (const g of projectGroups) {
        const gm = await groupSvc.getMembership(g.id, 'user', userId)
        if (gm) userGroupIds.push(g.id)
      }
    }

    const svc = sprintService(db)
    const board = await svc.getBoard(id, userGroupIds, isAdminOrOwner)
    return NextResponse.json(board)
  } catch (err) {
    return handleError(err)
  }
}
