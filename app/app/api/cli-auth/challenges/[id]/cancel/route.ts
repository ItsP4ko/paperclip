import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { boardAuthService } from '@/services/index'
import { resolveCliAuthChallengeSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await resolveActor(req)
    const { id } = await params
    const body = await parseBody(req, resolveCliAuthChallengeSchema)
    const boardAuth = boardAuthService(db)
    const cancelled = await boardAuth.cancelCliAuthChallenge(id.trim(), body.token)
    return NextResponse.json({
      status: cancelled.status,
      cancelled: cancelled.status === 'cancelled',
    })
  } catch (err) {
    return handleError(err)
  }
}
