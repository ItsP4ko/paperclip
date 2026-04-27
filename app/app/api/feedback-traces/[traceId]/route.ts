import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { feedbackService } from '@/services/index'

export const maxDuration = 30

function actorCanAccessCompany(
  actor: Awaited<ReturnType<typeof resolveActor>>,
  companyId: string,
): boolean {
  if (actor.type === 'none') return false
  if (actor.type === 'agent') return actor.companyId === companyId
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return true
  return (actor.companyIds ?? []).includes(companyId)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { traceId } = await params

    if (actor.type !== 'board') {
      return NextResponse.json({ error: 'Only board users can view feedback traces' }, { status: 403 })
    }

    const includePayload =
      req.nextUrl.searchParams.get('includePayload') === 'true' ||
      req.nextUrl.searchParams.get('includePayload') === null

    const feedback = feedbackService(db)
    const trace = await feedback.getFeedbackTraceById(traceId, includePayload)
    if (!trace || !actorCanAccessCompany(actor, trace.companyId)) {
      return NextResponse.json({ error: 'Feedback trace not found' }, { status: 404 })
    }
    return NextResponse.json(trace)
  } catch (err) {
    return handleError(err)
  }
}
