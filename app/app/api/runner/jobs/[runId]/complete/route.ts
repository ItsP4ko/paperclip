import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'

export const maxDuration = 30

const completeSchema = z.object({
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  timedOut: z.boolean(),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  resultJson: z.record(z.unknown()).nullable().optional(),
  sessionId: z.string().nullable().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { runId } = await params
    const body = await parseBody(req, completeSchema)
    const heartbeat = heartbeatService(db)
    const finalizedRun = await heartbeat.completeLocalRun(runId, body)
    return NextResponse.json({ run: finalizedRun })
  } catch (err) {
    return handleError(err)
  }
}
