import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, notFound } from '@/server/errors'
import { db } from '@/lib/db'
import { boardAuthService } from '@/services/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const trimmedId = id.trim()
    const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
    if (!trimmedId || !token) throw notFound('CLI auth challenge not found')

    const boardAuth = boardAuthService(db)
    const challenge = await boardAuth.describeCliAuthChallenge(trimmedId, token)
    if (!challenge) throw notFound('CLI auth challenge not found')

    const isSignedInBoardUser =
      actor.type === 'board' &&
      (actor.source === 'session' || actor.source === 'local_implicit') &&
      Boolean(actor.userId)
    const canApprove =
      isSignedInBoardUser &&
      (challenge.requestedAccess !== 'instance_admin_required' ||
        actor.source === 'local_implicit' ||
        Boolean(actor.isInstanceAdmin))

    return NextResponse.json({
      ...challenge,
      requiresSignIn: !isSignedInBoardUser,
      canApprove,
      currentUserId: actor.type === 'board' ? actor.userId ?? null : null,
    })
  } catch (err) {
    return handleError(err)
  }
}
