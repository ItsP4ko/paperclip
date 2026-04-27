import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden, unauthorized } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { accessService, logActivity, routineService } from '@/services/index'
import { createRoutineSchema } from '@paperclipai/shared'
import type { Actor } from '@/server/actor'

export const maxDuration = 30

async function assertDeveloperOrAbove(actor: Actor, companyId: string) {
  if (actor.type !== 'board') return
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  if (!actor.userId) throw forbidden('Authentication required')
  const access = accessService(db)
  const membership = await access.getMembership(companyId, 'user', actor.userId)
  if (!membership || !membership.membershipRole || membership.membershipRole === 'member') {
    throw forbidden('Developer or owner role required to manage routines')
  }
}

async function assertBoardCanAssignTasks(actor: Actor, companyId: string) {
  assertCompanyAccess(actor, companyId)
  if (actor.type !== 'board') return
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  const access = accessService(db)
  const allowed = await access.canUser(companyId, actor.userId, 'tasks:assign')
  if (!allowed) {
    throw forbidden('Missing permission: tasks:assign')
  }
}

async function assertCanManageCompanyRoutine(
  actor: Actor,
  companyId: string,
  assigneeAgentId?: string | null,
) {
  assertCompanyAccess(actor, companyId)
  if (actor.type === 'board') {
    await assertDeveloperOrAbove(actor, companyId)
    return
  }
  if (actor.type !== 'agent' || !actor.agentId) throw unauthorized()
  if (assigneeAgentId && assigneeAgentId !== actor.agentId) {
    throw forbidden('Agents can only manage routines assigned to themselves')
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = routineService(db)
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
    const body = await parseBody(req, createRoutineSchema)
    await assertBoardCanAssignTasks(actor, companyId)
    await assertCanManageCompanyRoutine(actor, companyId, body.assigneeAgentId)
    const svc = routineService(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await svc.create(companyId, body as any, {
      agentId: actor.type === 'agent' ? actor.agentId : null,
      userId: actor.type === 'board' ? actor.userId ?? 'board' : null,
    })
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'routine.created',
      entityType: 'routine',
      entityId: created.id,
      details: { title: created.title, assigneeAgentId: created.assigneeAgentId },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
