import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden, unauthorized } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { accessService, logActivity, routineService } from '@/services/index'
import { rotateRoutineTriggerSecretSchema } from '@paperclipai/shared'
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
    const svc = routineService(db)
    const trigger = await svc.getTrigger(id)
    if (!trigger) {
      return NextResponse.json({ error: 'Routine trigger not found' }, { status: 404 })
    }
    const routine = await assertCanManageExistingRoutine(actor, trigger.routineId)
    if (!routine) {
      return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    }
    await parseBody(req, rotateRoutineTriggerSecretSchema)
    const rotated = await svc.rotateTriggerSecret(trigger.id, {
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
      action: 'routine.trigger_secret_rotated',
      entityType: 'routine_trigger',
      entityId: trigger.id,
      details: { routineId: routine.id },
    })
    return NextResponse.json(rotated)
  } catch (err) {
    return handleError(err)
  }
}
