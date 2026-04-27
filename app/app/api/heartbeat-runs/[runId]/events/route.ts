import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseQuery } from '@/server/validate'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'
import { redactEventPayload } from '@/redaction'
import { getCurrentUserRedactionOptions, redactCurrentUserValue } from '../../../agents/_shared'

export const maxDuration = 30

const heartbeatEventsQuerySchema = z.object({
  afterSeq: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { runId } = await params
    const heartbeat = heartbeatService(db)
    const run = await heartbeat.getRun(runId)
    if (!run) return NextResponse.json({ error: 'Heartbeat run not found' }, { status: 404 })
    assertCompanyAccess(actor, run.companyId)

    const { afterSeq, limit } = parseQuery(req, heartbeatEventsQuerySchema)
    const events = await heartbeat.listEvents(runId, afterSeq, limit)
    const currentUserRedactionOptions = await getCurrentUserRedactionOptions()
    const redactedEvents = events.map((event) =>
      redactCurrentUserValue(
        { ...event, payload: redactEventPayload(event.payload) },
        currentUserRedactionOptions,
      ),
    )
    return NextResponse.json(redactedEvents)
  } catch (err) {
    return handleError(err)
  }
}
