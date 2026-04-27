import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { feedbackService } from '@/services/index'
import {
  feedbackTargetTypeSchema,
  feedbackVoteValueSchema,
  feedbackTraceStatusSchema,
} from '@paperclipai/shared'

export const maxDuration = 30

function parseBooleanQuery(value: unknown): boolean {
  return value === true || value === 'true' || value === '1'
}

function parseDateQuery(value: unknown, field: string): Date | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest(`Invalid ${field} query value`)
  }
  return parsed
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params
    const actor = await resolveActor(req)
    assertCompanyAccess(actor, companyId)
    assertBoard(actor)

    const sp = req.nextUrl.searchParams
    const targetTypeRaw = sp.get('targetType') ?? undefined
    const voteRaw = sp.get('vote') ?? undefined
    const statusRaw = sp.get('status') ?? undefined
    const issueIdRaw = sp.get('issueId')
    const projectIdRaw = sp.get('projectId')
    const issueId = issueIdRaw && issueIdRaw.trim().length > 0 ? issueIdRaw : undefined
    const projectId = projectIdRaw && projectIdRaw.trim().length > 0 ? projectIdRaw : undefined

    const feedback = feedbackService(db)
    const traces = await feedback.listFeedbackTraces({
      companyId,
      issueId,
      projectId,
      targetType: targetTypeRaw ? feedbackTargetTypeSchema.parse(targetTypeRaw) : undefined,
      vote: voteRaw ? feedbackVoteValueSchema.parse(voteRaw) : undefined,
      status: statusRaw ? feedbackTraceStatusSchema.parse(statusRaw) : undefined,
      from: parseDateQuery(sp.get('from'), 'from'),
      to: parseDateQuery(sp.get('to'), 'to'),
      sharedOnly: parseBooleanQuery(sp.get('sharedOnly')),
      includePayload: parseBooleanQuery(sp.get('includePayload')),
    })
    return NextResponse.json(traces)
  } catch (err) {
    return handleError(err)
  }
}
