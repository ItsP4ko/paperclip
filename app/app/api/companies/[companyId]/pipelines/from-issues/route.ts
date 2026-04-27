import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { pipelineService } from '@/services/pipelines'

const createPipelineFromIssuesSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  issueIds: z.array(z.string()).min(1),
})

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const body = await parseBody(req, createPipelineFromIssuesSchema)
    const svc = pipelineService(db)
    const pipeline = await svc.createFromIssues(companyId, { name: body.name, description: body.description, issueIds: body.issueIds })
    return NextResponse.json(pipeline, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
