import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, unauthorized } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { boardAuthService, logActivity } from '@/services/index'
import { resolveCliAuthChallengeSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params

    if (
      actor.type !== 'board' ||
      (!actor.userId && actor.source !== 'local_implicit')
    ) {
      throw unauthorized('Sign in before approving CLI access')
    }

    const body = await parseBody(req, resolveCliAuthChallengeSchema)
    const userId = actor.userId ?? 'local-board'
    const boardAuth = boardAuthService(db)
    const approved = await boardAuth.approveCliAuthChallenge(id.trim(), body.token, userId)

    if (approved.status === 'approved') {
      const companyIds = await boardAuth.resolveBoardActivityCompanyIds({
        userId,
        requestedCompanyId: approved.challenge.requestedCompanyId,
        boardApiKeyId: approved.challenge.boardApiKeyId,
      })
      for (const companyId of companyIds) {
        await logActivity(db, {
          companyId,
          actorType: 'user',
          actorId: userId,
          action: 'board_api_key.created',
          entityType: 'user',
          entityId: userId,
          details: {
            boardApiKeyId: approved.challenge.boardApiKeyId,
            requestedAccess: approved.challenge.requestedAccess,
            requestedCompanyId: approved.challenge.requestedCompanyId,
            challengeId: approved.challenge.id,
          },
        })
      }
    }

    return NextResponse.json({
      approved: approved.status === 'approved',
      status: approved.status,
      userId,
      keyId: approved.challenge.boardApiKeyId ?? null,
      expiresAt: approved.challenge.expiresAt.toISOString(),
    })
  } catch (err) {
    return handleError(err)
  }
}
