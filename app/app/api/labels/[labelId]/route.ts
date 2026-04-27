import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { issueService, logActivity } from '@/services/index'

export const maxDuration = 30

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ labelId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { labelId } = await params

    const svc = issueService(db)
    const existing = await svc.getLabelById(labelId)
    if (!existing) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)

    const removed = await svc.deleteLabel(labelId)
    if (!removed) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: removed.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'label.deleted',
      entityType: 'label',
      entityId: removed.id,
      details: { name: removed.name, color: removed.color },
    })

    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        await redis.del(`labels:${removed.companyId}`).catch(() => null)
      }
    } catch { /* redis unavailable */ }

    return NextResponse.json(removed)
  } catch (err) {
    return handleError(err)
  }
}
