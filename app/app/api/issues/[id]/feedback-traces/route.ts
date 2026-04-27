import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError, HttpError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, feedbackService } from '@/services/index'
import { feedbackTargetTypeSchema, feedbackTraceStatusSchema, feedbackVoteValueSchema } from '@paperclipai/shared'

export const maxDuration = 30

async function normalizeIssueIdentifier(rawId: string): Promise<string> {
  const svc = issueService(db)
  if (/^[A-Z]+-\d+$/i.test(rawId)) {
    const issue = await svc.getByIdentifier(rawId)
    if (issue) return issue.id
  }
  return rawId
}

function parseBooleanQuery(value: string | null): boolean {
  return value === 'true' || value === '1'
}

function parseDateQuery(value: string | null, field: string): Date | undefined {
  if (!value || value.trim().length === 0) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `Invalid ${field} query value`)
  }
  return parsed
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    if (actor.type !== 'board') {
      return NextResponse.json({ error: 'Only board users can view feedback traces' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const targetTypeRaw = sp.get('targetType')
    const voteRaw = sp.get('vote')
    const statusRaw = sp.get('status')

    const targetType = targetTypeRaw ? feedbackTargetTypeSchema.parse(targetTypeRaw) : undefined
    const vote = voteRaw ? feedbackVoteValueSchema.parse(voteRaw) : undefined
    const status = statusRaw ? feedbackTraceStatusSchema.parse(statusRaw) : undefined

    const feedback = feedbackService(db)
    const traces = await feedback.listFeedbackTraces({
      companyId: issue.companyId,
      issueId: issue.id,
      targetType,
      vote,
      status,
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
