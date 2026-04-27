import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService, logActivity } from '@/services/index'
import { assertCanUpdateAgent } from '../../../../_shared'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id, revisionId } = await params
    const svc = agentService(db)
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    await assertCanUpdateAgent(actor, existing)

    const actorInfo = getActorInfo(actor)
    const updated = await svc.rollbackConfigRevision(id, revisionId, {
      agentId: actorInfo.agentId,
      userId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
    })
    if (!updated) return NextResponse.json({ error: 'Revision not found' }, { status: 404 })

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'agent.config_rolled_back',
      entityType: 'agent',
      entityId: updated.id,
      details: { revisionId },
    })

    return NextResponse.json(updated)
  } catch (err) {
    return handleError(err)
  }
}
