import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { heartbeatService, logActivity } from '@/services/index'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { runId } = await params
    const heartbeat = heartbeatService(db)
    const run = await heartbeat.cancelRun(runId)

    if (run) {
      await logActivity(db, {
        companyId: run.companyId,
        actorType: 'user',
        actorId: actor.userId ?? 'board',
        action: 'heartbeat.cancelled',
        entityType: 'heartbeat_run',
        entityId: run.id,
        details: { agentId: run.agentId },
      })
    }

    return NextResponse.json(run)
  } catch (err) {
    return handleError(err)
  }
}
