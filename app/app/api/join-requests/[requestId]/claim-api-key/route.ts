import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { agentApiKeys, joinRequests } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError, notFound, badRequest, conflict, forbidden } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { hashToken, tokenHashesMatch } from '@/server/access-helpers'
import { agentService, logActivity } from '@/services/index'
import { claimJoinRequestApiKeySchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    await resolveActor(req)
    const { requestId } = await params
    const body = await parseBody(req, claimJoinRequestApiKeySchema)
    const presentedClaimSecretHash = hashToken(body.claimSecret)

    const joinRequest = await db
      .select()
      .from(joinRequests)
      .where(eq(joinRequests.id, requestId))
      .then((rows) => rows[0] ?? null)
    if (!joinRequest) throw notFound('Join request not found')
    if (joinRequest.requestType !== 'agent')
      throw badRequest('Only agent join requests can claim API keys')
    if (joinRequest.status !== 'approved')
      throw conflict('Join request must be approved before key claim')
    if (!joinRequest.createdAgentId) throw conflict('Join request has no created agent')
    if (!joinRequest.claimSecretHash) throw conflict('Join request is missing claim secret metadata')
    if (!tokenHashesMatch(joinRequest.claimSecretHash, presentedClaimSecretHash)) {
      throw forbidden('Invalid claim secret')
    }
    if (
      joinRequest.claimSecretExpiresAt &&
      joinRequest.claimSecretExpiresAt.getTime() <= Date.now()
    ) {
      throw conflict('Claim secret expired')
    }
    if (joinRequest.claimSecretConsumedAt) throw conflict('Claim secret already used')

    const existingKey = await db
      .select({ id: agentApiKeys.id })
      .from(agentApiKeys)
      .where(eq(agentApiKeys.agentId, joinRequest.createdAgentId))
      .then((rows) => rows[0] ?? null)
    if (existingKey) throw conflict('API key already claimed')

    const consumed = await db
      .update(joinRequests)
      .set({ claimSecretConsumedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(joinRequests.id, requestId), isNull(joinRequests.claimSecretConsumedAt)))
      .returning({ id: joinRequests.id })
      .then((rows) => rows[0] ?? null)
    if (!consumed) throw conflict('Claim secret already used')

    const agents = agentService(db)
    const created = await agents.createApiKey(joinRequest.createdAgentId, 'initial-join-key')

    await logActivity(db, {
      companyId: joinRequest.companyId,
      actorType: 'system',
      actorId: 'join-claim',
      action: 'agent_api_key.claimed',
      entityType: 'agent_api_key',
      entityId: created.id,
      details: { agentId: joinRequest.createdAgentId, joinRequestId: requestId },
    })

    return NextResponse.json(
      {
        keyId: created.id,
        token: created.token,
        agentId: joinRequest.createdAgentId,
        createdAt: created.createdAt,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
