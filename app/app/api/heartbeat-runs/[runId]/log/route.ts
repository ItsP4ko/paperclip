import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseQuery } from '@/server/validate'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'

export const maxDuration = 30

const logReadQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).optional().default(0),
  limitBytes: z.coerce.number().int().min(1).max(1048576).optional().default(256000),
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

    const { offset, limitBytes } = parseQuery(req, logReadQuerySchema)
    const result = await heartbeat.readLog(runId, { offset, limitBytes })
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
