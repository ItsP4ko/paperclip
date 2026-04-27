import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { goalService, logActivity } from '@/services/index'
import { updateGoalSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = goalService(db)
    const goal = await svc.getById(id)
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, goal.companyId)
    return NextResponse.json(goal)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = goalService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)
    const body = await parseBody(req, updateGoalSchema)
    const goal = await svc.update(id, body)
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: goal.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'goal.updated',
      entityType: 'goal',
      entityId: goal.id,
      details: body,
    })

    return NextResponse.json(goal)
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
    const svc = goalService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)
    const goal = await svc.remove(id)
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: goal.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'goal.deleted',
      entityType: 'goal',
      entityId: goal.id,
    })

    return NextResponse.json(goal)
  } catch (err) {
    return handleError(err)
  }
}
