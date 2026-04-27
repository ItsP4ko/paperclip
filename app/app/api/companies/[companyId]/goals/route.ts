import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { goalService, logActivity } from '@/services/index'
import { createGoalSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = goalService(db)
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
    const svc = goalService(db)
    const body = await parseBody(req, createGoalSchema)
    const goal = await svc.create(companyId, body)
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'goal.created',
      entityType: 'goal',
      entityId: goal.id,
      details: { title: goal.title },
    })
    return NextResponse.json(goal, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
