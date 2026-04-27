import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, unauthorized } from '@/server/errors'
import { db } from '@/lib/db'
import { boardAuthService } from '@/services/index'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    if (actor.type !== 'board' || !actor.userId) {
      throw unauthorized('Board authentication required')
    }
    const boardAuth = boardAuthService(db)
    const accessSnapshot = await boardAuth.resolveBoardAccess(actor.userId)
    return NextResponse.json({
      user: accessSnapshot.user,
      userId: actor.userId,
      isInstanceAdmin: accessSnapshot.isInstanceAdmin,
      companyIds: accessSnapshot.companyIds,
      source: actor.source ?? 'none',
      keyId: actor.source === 'board_key' ? actor.keyId ?? null : null,
    })
  } catch (err) {
    return handleError(err)
  }
}
