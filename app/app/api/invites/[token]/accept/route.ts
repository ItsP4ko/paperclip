import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { invites, joinRequests, companies } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import {
  handleError,
  notFound,
  badRequest,
  unauthorized,
  conflict,
} from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import {
  hashToken,
  createClaimSecret,
  inviteExpired,
  requestIp,
  isLocalImplicit,
  toJoinRequestResponse,
  grantsFromDefaults,
  resolveHumanJoinStatus,
  buildJoinDefaultsPayloadForAccept,
  mergeJoinDefaultsPayloadForReplay,
  canReplayOpenClawGatewayInviteAccept,
  normalizeAgentDefaultsForJoin,
  buildInviteOnboardingManifest,
  actorUserId,
  resolveActorEmail,
} from '@/server/access-helpers'
import { getDeploymentOpts } from '@/server/deployment-opts'
import { accessService, agentService, logActivity, deduplicateAgentName } from '@/services/index'
import { acceptInviteSchema } from '@paperclipai/shared'

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { token } = await params
    const trimmedToken = token.trim()
    if (!trimmedToken) throw notFound('Invite not found')

    const body = await parseBody(req, acceptInviteSchema)

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(trimmedToken)))
      .then((rows) => rows[0] ?? null)

    if (!invite || invite.revokedAt || inviteExpired(invite)) {
      throw notFound('Invite not found')
    }

    const inviteAlreadyAccepted = Boolean(invite.acceptedAt)
    const existingJoinRequestForInvite = inviteAlreadyAccepted
      ? await db
          .select()
          .from(joinRequests)
          .where(eq(joinRequests.inviteId, invite.id))
          .then((rows) => rows[0] ?? null)
      : null

    if (invite.inviteType === 'bootstrap_ceo') {
      if (inviteAlreadyAccepted) throw notFound('Invite not found')
      if (body.requestType !== 'human') {
        throw badRequest('Bootstrap invite requires human request type')
      }
      if (
        actor.type !== 'board' ||
        (!actor.userId && !isLocalImplicit(actor))
      ) {
        throw unauthorized('Authenticated user required for bootstrap acceptance')
      }
      const access = accessService(db)
      const userId = actor.userId ?? 'local-board'
      const existingAdmin = await access.isInstanceAdmin(userId)
      if (!existingAdmin) {
        await access.promoteInstanceAdmin(userId)
      }
      const updatedInvite = await db
        .update(invites)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(invites.id, invite.id))
        .returning()
        .then((rows) => rows[0] ?? invite)
      return NextResponse.json(
        {
          inviteId: updatedInvite.id,
          inviteType: updatedInvite.inviteType,
          bootstrapAccepted: true,
          userId,
        },
        { status: 202 },
      )
    }

    const requestType = body.requestType as 'human' | 'agent'
    const companyId = invite.companyId
    if (!companyId) throw conflict('Invite is missing company scope')
    if (
      invite.allowedJoinTypes !== 'both' &&
      invite.allowedJoinTypes !== requestType
    ) {
      throw badRequest(`Invite does not allow ${requestType} joins`)
    }

    if (requestType === 'human' && actor.type !== 'board') {
      throw unauthorized('Human invite acceptance requires authenticated user')
    }
    if (requestType === 'human' && actor.type === 'board' && !actor.userId && !isLocalImplicit(actor)) {
      throw unauthorized('Authenticated user is required')
    }
    if (requestType === 'agent' && !body.agentName) {
      if (!inviteAlreadyAccepted || !existingJoinRequestForInvite?.agentName) {
        throw badRequest('agentName is required for agent join requests')
      }
    }

    const adapterType = body.adapterType ?? null
    if (
      inviteAlreadyAccepted &&
      !canReplayOpenClawGatewayInviteAccept({
        requestType,
        adapterType,
        existingJoinRequest: existingJoinRequestForInvite,
      })
    ) {
      throw notFound('Invite not found')
    }
    const replayJoinRequestId = inviteAlreadyAccepted
      ? existingJoinRequestForInvite?.id ?? null
      : null
    if (inviteAlreadyAccepted && !replayJoinRequestId) {
      throw conflict('Join request not found')
    }

    const replayMergedDefaults = inviteAlreadyAccepted
      ? mergeJoinDefaultsPayloadForReplay(
          existingJoinRequestForInvite?.agentDefaultsPayload ?? null,
          body.agentDefaultsPayload ?? null,
        )
      : body.agentDefaultsPayload ?? null

    const gatewayDefaultsPayload =
      requestType === 'agent'
        ? buildJoinDefaultsPayloadForAccept({
            adapterType,
            defaultsPayload: replayMergedDefaults,
            paperclipApiUrl: body.paperclipApiUrl ?? null,
            inboundOpenClawAuthHeader: req.headers.get('x-openclaw-auth') ?? null,
            inboundOpenClawTokenHeader: req.headers.get('x-openclaw-token') ?? null,
          })
        : null

    const opts = getDeploymentOpts()
    const joinDefaults =
      requestType === 'agent'
        ? normalizeAgentDefaultsForJoin({
            adapterType,
            defaultsPayload: gatewayDefaultsPayload,
            ...opts,
          })
        : {
            normalized: null as Record<string, unknown> | null,
            diagnostics: [] as Array<{ code: string; level: 'info' | 'warn'; message: string; hint?: string }>,
            fatalErrors: [] as string[],
          }

    if (requestType === 'agent' && joinDefaults.fatalErrors.length > 0) {
      throw badRequest(joinDefaults.fatalErrors.join('; '))
    }

    const claimSecret =
      requestType === 'agent' && !inviteAlreadyAccepted ? createClaimSecret() : null
    const claimSecretHash = claimSecret ? hashToken(claimSecret) : null
    const claimSecretExpiresAt = claimSecret
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : null

    const actorEmail =
      requestType === 'human' ? await resolveActorEmail(db, actor) : null
    const { status: joinStatus, shouldAutoApprove } = resolveHumanJoinStatus(requestType)

    const access = accessService(db)

    const created = !inviteAlreadyAccepted
      ? await db.transaction(async (tx) => {
          await tx
            .update(invites)
            .set({ acceptedAt: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(invites.id, invite.id),
                isNull(invites.acceptedAt),
                isNull(invites.revokedAt),
              ),
            )

          let row = await tx
            .insert(joinRequests)
            .values({
              inviteId: invite.id,
              companyId,
              requestType,
              status: joinStatus,
              requestIp: requestIp(req),
              requestingUserId:
                requestType === 'human'
                  ? (actor.type === 'board' ? actor.userId : null) ?? 'local-board'
                  : null,
              requestEmailSnapshot: requestType === 'human' ? actorEmail : null,
              agentName: requestType === 'agent' ? body.agentName : null,
              adapterType: requestType === 'agent' ? adapterType : null,
              capabilities: requestType === 'agent' ? body.capabilities ?? null : null,
              agentDefaultsPayload:
                requestType === 'agent' ? joinDefaults.normalized : null,
              claimSecretHash,
              claimSecretExpiresAt,
            })
            .returning()
            .then((rows) => rows[0])

          if (shouldAutoApprove && row) {
            const userId =
              actor.type === 'board' && actor.userId
                ? actor.userId
                : isLocalImplicit(actor)
                  ? 'local-board'
                  : null
            if (userId) {
              await access.ensureMembership(companyId, 'user', userId, 'member', 'active')
              const grants = grantsFromDefaults(
                invite.defaultsPayload as Record<string, unknown> | null,
                'human',
              )
              await access.setPrincipalGrants(companyId, 'user', userId, grants, userId)
              await tx
                .update(joinRequests)
                .set({
                  status: 'approved',
                  approvedByUserId: userId,
                  approvedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(joinRequests.id, row.id))
              row = {
                ...row,
                status: 'approved',
                approvedByUserId: userId,
                approvedAt: new Date(),
              }
            }
          }

          return row
        })
      : await db
          .update(joinRequests)
          .set({
            requestIp: requestIp(req),
            agentName:
              requestType === 'agent'
                ? body.agentName ?? existingJoinRequestForInvite?.agentName ?? null
                : null,
            capabilities:
              requestType === 'agent'
                ? body.capabilities ?? existingJoinRequestForInvite?.capabilities ?? null
                : null,
            adapterType: requestType === 'agent' ? adapterType : null,
            agentDefaultsPayload:
              requestType === 'agent' ? joinDefaults.normalized : null,
            updatedAt: new Date(),
          })
          .where(eq(joinRequests.id, replayJoinRequestId as string))
          .returning()
          .then((rows) => rows[0])

    if (!created) {
      throw conflict('Join request not found')
    }

    // Handle openclaw gateway replay for approved agents
    if (
      inviteAlreadyAccepted &&
      requestType === 'agent' &&
      adapterType === 'openclaw_gateway' &&
      created.status === 'approved' &&
      created.createdAgentId
    ) {
      const agents = agentService(db)
      const existingAgent = await agents.getById(created.createdAgentId)
      if (!existingAgent) throw conflict('Approved join request agent not found')
      const existingAdapterConfig =
        existingAgent.adapterConfig && typeof existingAgent.adapterConfig === 'object'
          ? (existingAgent.adapterConfig as Record<string, unknown>)
          : {}
      const nextAdapterConfig = { ...existingAdapterConfig, ...(joinDefaults.normalized ?? {}) }
      const updatedAgent = await agents.update(created.createdAgentId, {
        adapterType,
        adapterConfig: nextAdapterConfig,
      })
      if (!updatedAgent) throw conflict('Approved join request agent not found')
      await logActivity(db, {
        companyId,
        actorType: actor.type === 'agent' ? 'agent' : 'user',
        actorId:
          actor.type === 'agent'
            ? actor.agentId ?? 'invite-agent'
            : (actor.type === 'board' ? actor.userId : null) ?? 'board',
        action: 'agent.updated_from_join_replay',
        entityType: 'agent',
        entityId: updatedAgent.id,
        details: { inviteId: invite.id, joinRequestId: created.id },
      })
    }

    await logActivity(db, {
      companyId,
      actorType: actor.type === 'agent' ? 'agent' : 'user',
      actorId:
        actor.type === 'agent'
          ? actor.agentId ?? 'invite-agent'
          : (actor.type === 'board' ? actor.userId : null) ?? (requestType === 'agent' ? 'invite-anon' : 'board'),
      action: inviteAlreadyAccepted
        ? 'join.request_replayed'
        : created?.status === 'approved'
          ? 'join.auto_approved'
          : 'join.requested',
      entityType: 'join_request',
      entityId: created.id,
      details: {
        requestType,
        requestIp: created.requestIp,
        inviteReplay: inviteAlreadyAccepted,
      },
    })

    const response = toJoinRequestResponse(created)
    if (claimSecret) {
      const companyName = await getInviteCompanyName(invite.companyId)
      const deployOpts = getDeploymentOpts()
      const onboardingManifest = buildInviteOnboardingManifest(req, trimmedToken, invite, {
        ...deployOpts,
        companyName,
      })
      return NextResponse.json(
        {
          ...response,
          claimSecret,
          claimApiKeyPath: `/api/join-requests/${created.id}/claim-api-key`,
          onboarding: onboardingManifest.onboarding,
          diagnostics: joinDefaults.diagnostics,
        },
        { status: 202 },
      )
    }

    return NextResponse.json(
      {
        ...response,
        ...(joinDefaults.diagnostics.length > 0 ? { diagnostics: joinDefaults.diagnostics } : {}),
      },
      { status: 202 },
    )
  } catch (err) {
    return handleError(err)
  }
}
