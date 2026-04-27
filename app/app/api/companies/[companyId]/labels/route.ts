import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { issueService, logActivity } from '@/services/index'
import { createIssueLabelSchema } from '@paperclipai/shared'

export const maxDuration = 30

const LABELS_TTL = 300

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const cacheKey = `labels:${companyId}`
    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        const cached = await redis.get(cacheKey).catch(() => null)
        if (cached) return NextResponse.json(JSON.parse(cached))
      }
    } catch { /* redis unavailable */ }

    const svc = issueService(db)
    const result = await svc.listLabels(companyId)

    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        await redis.set(cacheKey, JSON.stringify(result), { EX: LABELS_TTL }).catch(() => null)
      }
    } catch { /* redis unavailable */ }

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

    const body = await parseBody(req, createIssueLabelSchema)
    const svc = issueService(db)
    const label = await svc.createLabel(companyId, body)
    const actorInfo = getActorInfo(actor)

    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'label.created',
      entityType: 'label',
      entityId: label.id,
      details: { name: label.name, color: label.color },
    })

    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        await redis.del(`labels:${companyId}`).catch(() => null)
      }
    } catch { /* redis unavailable */ }

    return NextResponse.json(label, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
