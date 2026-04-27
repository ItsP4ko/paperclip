import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleError, notFound } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { pipelineService } from '@/services/pipelines'

const PIPELINE_DETAIL_TTL = 300

const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
})

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; pipelineId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, pipelineId } = await params
    assertCompanyAccess(actor, companyId)

    const cacheKey = `paperclip:pipeline:detail:${pipelineId}`
    const redis = await getRedis().catch(() => null)
    if (redis) {
      const cached = await redis.get(cacheKey).catch(() => null)
      if (cached) {
        return NextResponse.json(JSON.parse(cached as string))
      }
    }

    const svc = pipelineService(db)
    const pipeline = await svc.getById(companyId, pipelineId)
    if (!pipeline) throw notFound('Pipeline not found')

    if (redis) {
      await redis.set(cacheKey, JSON.stringify(pipeline), { EX: PIPELINE_DETAIL_TTL }).catch(() => null)
    }

    return NextResponse.json(pipeline)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; pipelineId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, pipelineId } = await params
    assertCompanyAccess(actor, companyId)
    const body = await parseBody(req, updatePipelineSchema)
    const svc = pipelineService(db)
    const pipeline = await svc.update(companyId, pipelineId, { name: body.name, description: body.description, status: body.status })
    if (!pipeline) throw notFound('Pipeline not found')
    const redis = await getRedis().catch(() => null)
    if (redis) {
      await redis.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null)
    }
    return NextResponse.json(pipeline)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; pipelineId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, pipelineId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = pipelineService(db)
    await svc.delete(companyId, pipelineId)
    const redis = await getRedis().catch(() => null)
    if (redis) {
      await redis.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null)
    }
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return handleError(err)
  }
}
