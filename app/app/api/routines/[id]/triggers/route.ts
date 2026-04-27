import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden, unauthorized } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { accessService, logActivity, routineService } from '@/services/index'
import { createRoutineTriggerSchema } from '@paperclipai/shared'
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

async function assertCanManageExistingRoutine(actor: Actor, routineId: string) {
  const svc = routineService(db)
  const routine = await svc.get(routineId)
  if (!routine) return null
  assertCompanyAccess(actor, routine.companyId)
  if (actor.type === 'board') {
    await assertDeveloperOrAbove(actor, routine.companyId)
    return routine
  }
  if (actor.type !== 'agent' || !actor.agentId) throw unauthorized()
  if (routine.assigneeAgentId !== actor.agentId) {
    throw forbidden('Agents can only manage routines assigned to themselves')
  }
  return routine
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const routine = await assertCanManageExistingRoutine(actor, id)
    if (!routine) {
      return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    }
    await assertBoardCanAssignTasks(actor, routine.companyId)
    const body = await parseBody(req, createRoutineTriggerSchema)
    const svc = routineService(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await svc.createTrigger(routine.id, body as any, {
      agentId: actor.type === 'agent' ? actor.agentId : null,
      userId: actor.type === 'board' ? actor.userId ?? 'board' : null,
    })
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: routine.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'routine.trigger_created',
      entityType: 'routine_trigger',
      entityId: created.trigger.id,
      details: { routineId: routine.id, kind: created.trigger.kind },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
