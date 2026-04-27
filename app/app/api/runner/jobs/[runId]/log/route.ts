import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'

export const maxDuration = 30

const logSchema = z.object({
  stream: z.enum(['stdout', 'stderr']),
  chunk: z.string(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { runId } = await params
    const body = await parseBody(req, logSchema)
    const heartbeat = heartbeatService(db)
    await heartbeat.appendLocalRunLog(runId, body.stream, body.chunk)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
