import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { invites, companies } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError, notFound } from '@/server/errors'
import { db } from '@/lib/db'
import { hashToken, inviteExpired, toInviteSummaryResponse } from '@/server/access-helpers'

export const maxDuration = 30

async function getInviteCompanyName(companyId: string | null): Promise<string | null> {
  if (!companyId) return null
  const row = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((rows) => rows[0] ?? null)
  return row?.name ?? null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await resolveActor(req)
    const { token } = await params
    const trimmedToken = token.trim()
    if (!trimmedToken) throw notFound('Invite not found')

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(trimmedToken)))
      .then((rows) => rows[0] ?? null)

    if (!invite || invite.revokedAt || invite.acceptedAt || inviteExpired(invite)) {
      throw notFound('Invite not found')
    }

    const companyName = await getInviteCompanyName(invite.companyId)
    return NextResponse.json(toInviteSummaryResponse(req, trimmedToken, invite, companyName))
  } catch (err) {
    return handleError(err)
  }
}
