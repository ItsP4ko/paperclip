import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleError, notFound } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { pipelineService } from '@/services/pipelines'

const updatePipelineStepSchema = z.object({
  name: z.string().min(1).optional(),
  agentId: z.string().nullable().optional(),
  assigneeType: z.enum(['agent', 'user']).nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  issueId: z.string().nullable().optional(),
  dependsOn: z.array(z.string()).optional(),
  position: z.number().optional(),
  config: z.record(z.unknown()).optional(),
  positionX: z.number().nullable().optional(),
  positionY: z.number().nullable().optional(),
  stepType: z.enum(['action', 'if_else']).optional(),
})

export const maxDuration = 30

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; pipelineId: string; stepId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, pipelineId, stepId } = await params
    assertCompanyAccess(actor, companyId)
    const body = await parseBody(req, updatePipelineStepSchema)
    const svc = pipelineService(db)
    const step = await svc.updateStep(companyId, pipelineId, stepId, body)
    if (!step) throw notFound('Step not found')
    const redis = await getRedis().catch(() => null)
    if (redis) {
      await redis.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null)
    }
    return NextResponse.json(step)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; pipelineId: string; stepId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, pipelineId, stepId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = pipelineService(db)
    await svc.deleteStep(companyId, pipelineId, stepId)
    const redis = await getRedis().catch(() => null)
    if (redis) {
      await redis.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null)
    }
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return handleError(err)
  }
}
