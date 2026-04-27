import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { joinRequests } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError, notFound, conflict } from '@/server/errors'
import { db } from '@/lib/db'
import { isLocalImplicit, toJoinRequestResponse, assertCompanyPermission } from '@/server/access-helpers'
import { logActivity } from '@/services/index'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; requestId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, requestId } = await params
    await assertCompanyPermission(db, actor, companyId, 'joins:approve')

    const existing = await db
      .select()
      .from(joinRequests)
      .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.id, requestId)))
      .then((rows) => rows[0] ?? null)
    if (!existing) throw notFound('Join request not found')
    if (existing.status !== 'pending_approval') throw conflict('Join request is not pending')

    const rejected = await db
      .update(joinRequests)
      .set({
        status: 'rejected',
        rejectedByUserId:
          actor.type === 'board'
            ? actor.userId
            : isLocalImplicit(actor)
              ? 'local-board'
              : null,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(joinRequests.id, requestId))
      .returning()
      .then((rows) => rows[0])

    await logActivity(db, {
      companyId,
      actorType: 'user',
      actorId: actor.type === 'board' ? actor.userId : 'board',
      action: 'join.rejected',
      entityType: 'join_request',
      entityId: requestId,
      details: { requestType: existing.requestType },
    })

    return NextResponse.json(toJoinRequestResponse(rejected))
  } catch (err) {
    return handleError(err)
  }
}
