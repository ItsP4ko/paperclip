import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, badRequest } from '@/server/errors'
import { db } from '@/lib/db'
import { boardAuthService, logActivity } from '@/services/index'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    if (actor.type !== 'board' || actor.source !== 'board_key') {
      throw badRequest('Current board API key context is required')
    }
    const boardAuth = boardAuthService(db)
    const key = await boardAuth.assertCurrentBoardKey(actor.keyId, actor.userId)
    await boardAuth.revokeBoardApiKey(key.id)
    const companyIds = await boardAuth.resolveBoardActivityCompanyIds({
      userId: key.userId,
      boardApiKeyId: key.id,
    })
    for (const companyId of companyIds) {
      await logActivity(db, {
        companyId,
        actorType: 'user',
        actorId: key.userId,
        action: 'board_api_key.revoked',
        entityType: 'user',
        entityId: key.userId,
        details: {
          boardApiKeyId: key.id,
          revokedVia: 'cli_auth_logout',
        },
      })
    }
    return NextResponse.json({ revoked: true, keyId: key.id })
  } catch (err) {
    return handleError(err)
  }
}
