import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { invites } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError, notFound, conflict } from '@/server/errors'
import { db } from '@/lib/db'
import { assertInstanceAdmin } from '@/server/authz'
import { assertCompanyPermission } from '@/server/access-helpers'
import { logActivity } from '@/services/index'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { inviteId: id } = await params

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.id, id))
      .then((rows) => rows[0] ?? null)

    if (!invite) throw notFound('Invite not found')

    if (invite.inviteType === 'bootstrap_ceo') {
      assertInstanceAdmin(actor)
    } else {
      if (!invite.companyId) throw conflict('Invite is missing company scope')
      await assertCompanyPermission(db, actor, invite.companyId, 'users:invite')
    }

    if (invite.acceptedAt) throw conflict('Invite already consumed')
    if (invite.revokedAt) return NextResponse.json(invite)

    const revoked = await db
      .update(invites)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(invites.id, id))
      .returning()
      .then((rows) => rows[0])

    if (invite.companyId) {
      await logActivity(db, {
        companyId: invite.companyId,
        actorType: actor.type === 'agent' ? 'agent' : 'user',
        actorId:
          actor.type === 'agent'
            ? actor.agentId ?? 'unknown-agent'
            : actor.type === 'board' ? actor.userId : 'board',
        action: 'invite.revoked',
        entityType: 'invite',
        entityId: id,
      })
    }

    return NextResponse.json(revoked)
  } catch (err) {
    return handleError(err)
  }
}
