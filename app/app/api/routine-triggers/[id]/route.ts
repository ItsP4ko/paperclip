import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden, unauthorized } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { accessService, logActivity, routineService } from '@/services/index'
import { updateRoutineTriggerSchema } from '@paperclipai/shared'
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = routineService(db)
    const trigger = await svc.getTrigger(id)
    if (!trigger) {
      return NextResponse.json({ error: 'Routine trigger not found' }, { status: 404 })
    }
    const routine = await assertCanManageExistingRoutine(actor, trigger.routineId)
    if (!routine) {
      return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    }
    await assertBoardCanAssignTasks(actor, routine.companyId)
    const body = await parseBody(req, updateRoutineTriggerSchema)
    const updated = await svc.updateTrigger(trigger.id, body, {
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
      action: 'routine.trigger_updated',
      entityType: 'routine_trigger',
      entityId: trigger.id,
      details: {
        routineId: routine.id,
        kind: (updated as { kind?: string })?.kind ?? trigger.kind,
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = routineService(db)
    const trigger = await svc.getTrigger(id)
    if (!trigger) {
      return NextResponse.json({ error: 'Routine trigger not found' }, { status: 404 })
    }
    const routine = await assertCanManageExistingRoutine(actor, trigger.routineId)
    if (!routine) {
      return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    }
    await svc.deleteTrigger(trigger.id)
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: routine.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'routine.trigger_deleted',
      entityType: 'routine_trigger',
      entityId: trigger.id,
      details: { routineId: routine.id, kind: trigger.kind },
    })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return handleError(err)
  }
}
