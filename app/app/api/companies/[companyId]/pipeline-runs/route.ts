import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { pipelineService } from '@/services/pipelines'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const pipelineId = req.nextUrl.searchParams.get('pipelineId') ?? undefined
    const svc = pipelineService(db)
    const rows = await svc.listRuns(companyId, pipelineId)
    return NextResponse.json(rows)
  } catch (err) {
    return handleError(err)
  }
}
