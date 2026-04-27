import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { invites, companies } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError, conflict } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import {
  hashToken,
  createInviteToken,
  isInviteTokenHashCollisionError,
  companyInviteExpiresAt,
  companyHumanInviteExpiresAt,
  mergeInviteDefaults,
  toInviteSummaryResponse,
  assertCompanyPermission,
  actorUserId,
} from '@/server/access-helpers'
import { logActivity } from '@/services/index'
import { createCompanyInviteSchema } from '@paperclipai/shared'

export const maxDuration = 30

const INVITE_TOKEN_MAX_RETRIES = 5

async function getInviteCompanyName(companyId: string | null): Promise<string | null> {
  if (!companyId) return null
  const row = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((rows) => rows[0] ?? null)
  return row?.name ?? null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    await assertCompanyPermission(db, actor, companyId, 'users:invite')

    const body = await parseBody(req, createCompanyInviteSchema)
    const normalizedAgentMessage =
      typeof body.agentMessage === 'string' ? body.agentMessage.trim() || null : null

    const insertValues = {
      companyId,
      inviteType: 'company_join' as const,
      allowedJoinTypes: body.allowedJoinTypes,
      defaultsPayload: mergeInviteDefaults(body.defaultsPayload ?? null, normalizedAgentMessage),
      expiresAt: body.allowedJoinTypes === 'human'
        ? companyHumanInviteExpiresAt()
        : companyInviteExpiresAt(),
      invitedByUserId: actorUserId(actor),
    }

    let token: string | null = null
    let created: (typeof invites.$inferSelect) | null = null
    for (let attempt = 0; attempt < INVITE_TOKEN_MAX_RETRIES; attempt += 1) {
      const candidateToken = createInviteToken()
      try {
        const row = await db
          .insert(invites)
          .values({ ...insertValues, tokenHash: hashToken(candidateToken) })
          .returning()
          .then((rows) => rows[0])
        token = candidateToken
        created = row
        break
      } catch (error) {
        if (!isInviteTokenHashCollisionError(error)) throw error
      }
    }
    if (!token || !created) {
      throw conflict('Failed to generate a unique invite token. Please retry.')
    }

    await logActivity(db, {
      companyId,
      actorType: actor.type === 'agent' ? 'agent' : 'user',
      actorId:
        actor.type === 'agent'
          ? actor.agentId ?? 'unknown-agent'
          : actor.type === 'board' ? actor.userId : 'board',
      action: 'invite.created',
      entityType: 'invite',
      entityId: created.id,
      details: {
        inviteType: created.inviteType,
        allowedJoinTypes: created.allowedJoinTypes,
        expiresAt: created.expiresAt.toISOString(),
        hasAgentMessage: Boolean(normalizedAgentMessage),
      },
    })

    const companyName = await getInviteCompanyName(created.companyId)
    const inviteSummary = toInviteSummaryResponse(req, token, created, companyName)

    return NextResponse.json(
      {
        ...created,
        token,
        inviteUrl: `/invite/${token}`,
        companyName,
        onboardingTextPath: inviteSummary.onboardingTextPath,
        onboardingTextUrl: inviteSummary.onboardingTextUrl,
        inviteMessage: inviteSummary.inviteMessage,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
