import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleError, notFound } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { pipelineService } from '@/services/pipelines'

const triggerPipelineRunSchema = z.object({
  projectId: z.string().optional(),
  triggeredBy: z.string().optional(),
})

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; pipelineId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, pipelineId } = await params
    assertCompanyAccess(actor, companyId)
    const body = await parseBody(req, triggerPipelineRunSchema)
    const svc = pipelineService(db)
    const run = await svc.triggerRun(companyId, pipelineId, { projectId: body.projectId, triggeredBy: body.triggeredBy })
    if (!run) throw notFound('Pipeline not found')
    return NextResponse.json(run, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
