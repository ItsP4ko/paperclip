import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { invites, companies } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError, forbidden, unauthorized, conflict } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import {
  hashToken,
  createInviteToken,
  isInviteTokenHashCollisionError,
  companyInviteExpiresAt,
  mergeInviteDefaults,
  toInviteSummaryResponse,
  actorUserId,
} from '@/server/access-helpers'
import { accessService, agentService, logActivity } from '@/services/index'
import { createOpenClawInvitePromptSchema } from '@paperclipai/shared'

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

async function assertCanGenerateOpenClawInvitePrompt(
  actor: Awaited<ReturnType<typeof resolveActor>>,
  companyId: string,
) {
  assertCompanyAccess(actor, companyId)
  if (actor.type === 'agent') {
    if (!actor.agentId) throw forbidden('Agent authentication required')
    const agents = agentService(db)
    const actorAgent = await agents.getById(actor.agentId)
    if (!actorAgent || actorAgent.companyId !== companyId) {
      throw forbidden('Agent key cannot access another company')
    }
    if (actorAgent.role !== 'ceo') {
      throw forbidden('Only CEO agents can generate OpenClaw invite prompts')
    }
    return
  }
  if (actor.type !== 'board') throw unauthorized()
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  const access = accessService(db)
  const allowed = await access.canUser(companyId, actor.userId, 'users:invite')
  if (!allowed) throw forbidden('Permission denied')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    await assertCanGenerateOpenClawInvitePrompt(actor, companyId)

    const body = await parseBody(req, createOpenClawInvitePromptSchema)
    const normalizedAgentMessage =
      typeof body.agentMessage === 'string' ? body.agentMessage.trim() || null : null

    const insertValues = {
      companyId,
      inviteType: 'company_join' as const,
      allowedJoinTypes: 'agent' as const,
      defaultsPayload: mergeInviteDefaults(null, normalizedAgentMessage),
      expiresAt: companyInviteExpiresAt(),
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
      action: 'invite.openclaw_prompt_created',
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
