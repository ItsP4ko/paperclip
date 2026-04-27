import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, notFound, badRequest, unauthorized, conflict } from '@/server/errors'
import { claimBoardOwnership } from '@/server/board-claim'
import { db } from '@/lib/db'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { token } = await params
    const trimmedToken = token.trim()
    if (!trimmedToken) throw notFound('Board claim challenge not found')

    let body: { code?: string } = {}
    try { body = await req.json() } catch { /* ignore */ }
    const code = typeof body.code === 'string' ? body.code.trim() : undefined
    if (!code) throw badRequest('Claim code is required')

    if (
      actor.type !== 'board' ||
      actor.source !== 'session' ||
      !actor.userId
    ) {
      throw unauthorized('Sign in before claiming board ownership')
    }

    const claimed = await claimBoardOwnership(db, {
      token: trimmedToken,
      code,
      userId: actor.userId,
    })

    if (claimed.status === 'invalid') throw notFound('Board claim challenge not found')
    if (claimed.status === 'expired') {
      throw conflict('Board claim challenge expired. Restart server to generate a new one.')
    }
    if (claimed.status === 'claimed') {
      return NextResponse.json({
        claimed: true,
        userId: claimed.claimedByUserId ?? actor.userId,
      })
    }

    throw conflict('Board claim challenge is no longer available')
  } catch (err) {
    return handleError(err)
  }
}
