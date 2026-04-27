import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { pipelineService } from '@/services/pipelines'

const createPipelineSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
})

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = pipelineService(db)
    const rows = await svc.list(companyId)
    return NextResponse.json(rows)
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
    const body = await parseBody(req, createPipelineSchema)
    const svc = pipelineService(db)
    const pipeline = await svc.create(companyId, { name: body.name, description: body.description, status: body.status })
    return NextResponse.json(pipeline, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
