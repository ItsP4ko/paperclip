import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { pipelineService } from '@/services/pipelines'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; runId: string; runStepId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, runId, runStepId } = await params
    assertCompanyAccess(actor, companyId)

    const userId = actor.type === 'board' ? actor.userId : null
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const svc = pipelineService(db)
    const result = await svc.completeRunStep(companyId, runId, runStepId, userId)
    if (!result) {
      return NextResponse.json({ error: 'Step not found or not assignable' }, { status: 404 })
    }

    const redis = await getRedis().catch(() => null)
    if (redis) {
      await redis.del(`paperclip:pipeline:run:${runId}`).catch(() => null)
    }

    return NextResponse.json({ completed: true })
  } catch (err) {
    return handleError(err)
  }
}
