import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { pipelineService } from '@/services/pipelines'

const batchPositionsSchema = z.object({
  positions: z.array(z.object({
    stepId: z.string(),
    positionX: z.number(),
    positionY: z.number(),
  })).min(1),
})

export const maxDuration = 30

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; pipelineId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, pipelineId } = await params
    assertCompanyAccess(actor, companyId)
    const body = await parseBody(req, batchPositionsSchema)
    const svc = pipelineService(db)
    await svc.batchUpdatePositions(companyId, pipelineId, body.positions)
    const redis = await getRedis().catch(() => null)
    if (redis) {
      await redis.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null)
    }
    return NextResponse.json({ updated: body.positions.length })
  } catch (err) {
    return handleError(err)
  }
}
