import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'
import { getCurrentUserRedactionOptions, redactCurrentUserValue } from '../../agents/_shared'

export const maxDuration = 30

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
    return NextResponse.json(redactCurrentUserValue(run, await getCurrentUserRedactionOptions()))
  } catch (err) {
    return handleError(err)
  }
}
