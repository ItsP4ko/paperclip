import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService, heartbeatService, logActivity } from '@/services/index'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = agentService(db)
    const agent = await svc.getById(id)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    assertCompanyAccess(actor, agent.companyId)

    if (actor.type === 'agent' && actor.agentId !== id) {
      return NextResponse.json({ error: 'Agent can only invoke itself' }, { status: 403 })
    }

    const heartbeat = heartbeatService(db)
    const run = await heartbeat.invoke(
      id,
      'on_demand',
      {
        triggeredBy: actor.type,
        actorId:
          actor.type === 'agent' ? actor.agentId : actor.type === 'board' ? actor.userId : undefined,
      },
      'manual',
      {
        actorType: actor.type === 'agent' ? 'agent' : 'user',
        actorId:
          actor.type === 'agent' ? actor.agentId ?? null : actor.type === 'board' ? actor.userId ?? null : null,
      },
    )

    if (!run) {
      return NextResponse.json({ status: 'skipped' }, { status: 202 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'heartbeat.invoked',
      entityType: 'heartbeat_run',
      entityId: run.id,
      details: { agentId: id },
    })

    return NextResponse.json(run, { status: 202 })
  } catch (err) {
    return handleError(err)
  }
}
