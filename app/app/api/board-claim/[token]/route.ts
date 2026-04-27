import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, notFound } from '@/server/errors'
import { inspectBoardClaimChallenge } from '@/server/board-claim'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await resolveActor(req)
    const { token } = await params
    const trimmedToken = token.trim()
    const code = req.nextUrl.searchParams.get('code') ?? undefined
    if (!trimmedToken) throw notFound('Board claim challenge not found')
    const challenge = inspectBoardClaimChallenge(trimmedToken, code)
    if (challenge.status === 'invalid') throw notFound('Board claim challenge not found')
    return NextResponse.json(challenge)
  } catch (err) {
    return handleError(err)
  }
}
