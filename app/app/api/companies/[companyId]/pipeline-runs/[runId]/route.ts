import { NextRequest, NextResponse } from 'next/server'
import { handleError, notFound } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { pipelineService } from '@/services/pipelines'

const PIPELINE_RUN_TTL = 300

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; runId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, runId } = await params
    assertCompanyAccess(actor, companyId)

    const cacheKey = `paperclip:pipeline:run:${runId}`
    const redis = await getRedis().catch(() => null)
    if (redis) {
      const cached = await redis.get(cacheKey).catch(() => null)
      if (cached) {
        return NextResponse.json(JSON.parse(cached as string))
      }
    }

    const svc = pipelineService(db)
    const run = await svc.getRunById(companyId, runId)
    if (!run) throw notFound('Run not found')

    if (redis) {
      const isRunning = run.status === 'running' || run.status === 'pending'
      const ttl = isRunning ? 5 : PIPELINE_RUN_TTL
      await redis.set(cacheKey, JSON.stringify(run), { EX: ttl }).catch(() => null)
    }

    return NextResponse.json(run)
  } catch (err) {
    return handleError(err)
  }
}
