import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden, notFound, badRequest } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { eq } from 'drizzle-orm'
import { projects } from '@paperclipai/db'
import { db } from '@/lib/db'
import { groupService } from '@/services/groups'
import { accessService } from '@/services/access'
import { addGroupProjectsSchema } from '@paperclipai/shared'
import type { Actor } from '@/server/actor'

export const maxDuration = 30

function getUserId(actor: Actor): string {
  if (actor.type === 'board' && actor.userId) return actor.userId
  throw forbidden('User authentication required')
}

async function assertOwnerOrGroupAdmin(actor: Actor, companyId: string, groupId: string) {
  if (actor.type === 'board' && (actor.source === 'local_implicit' || actor.isInstanceAdmin)) return
  const userId = getUserId(actor)
  const access = accessService(db)
  const membership = await access.getMembership(companyId, 'user', userId)
  if (!membership || membership.status !== 'active') throw forbidden('Active company membership required')
  if (membership.membershipRole === 'owner') return
  const svc = groupService(db)
  const groupMember = await svc.getMembership(groupId, 'user', userId)
  if (!groupMember || groupMember.role !== 'admin') {
    throw forbidden('Owner or group admin role required')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; groupId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, groupId } = await params
    assertCompanyAccess(actor, companyId)
    await assertOwnerOrGroupAdmin(actor, companyId, groupId)
    const svc = groupService(db)
    const group = await svc.getById(groupId)
    if (!group || group.companyId !== companyId) throw notFound('Group not found')
    const userId = getUserId(actor)
    const body = await parseBody(req, addGroupProjectsSchema) as { projectIds: string[] }

    for (const projectId of body.projectIds) {
      const [project] = await db
        .select({ companyId: projects.companyId })
        .from(projects)
        .where(eq(projects.id, projectId))
      if (!project || project.companyId !== companyId) {
        throw badRequest(`Project ${projectId} not found in this company`)
      }
    }

    const added = await svc.addProjects(groupId, body.projectIds, userId)
    return NextResponse.json(added, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
