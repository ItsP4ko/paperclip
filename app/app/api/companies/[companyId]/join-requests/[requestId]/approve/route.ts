import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { invites, joinRequests } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError, notFound, conflict } from '@/server/errors'
import { db } from '@/lib/db'
import {
  isLocalImplicit,
  toJoinRequestResponse,
  grantsFromDefaults,
  agentJoinGrantsFromDefaults,
  resolveJoinRequestAgentManagerId,
  assertCompanyPermission,
} from '@/server/access-helpers'
import { accessService, agentService, logActivity, deduplicateAgentName, notifyHireApproved } from '@/services/index'

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

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.id, existing.inviteId))
      .then((rows) => rows[0] ?? null)
    if (!invite) throw notFound('Invite not found')

    const access = accessService(db)
    const agents = agentService(db)

    let createdAgentId: string | null = existing.createdAgentId ?? null

    if (existing.requestType === 'human') {
      if (!existing.requestingUserId) throw conflict('Join request missing user identity')
      await access.ensureMembership(companyId, 'user', existing.requestingUserId, 'member', 'active')
      const grants = grantsFromDefaults(
        invite.defaultsPayload as Record<string, unknown> | null,
        'human',
      )
      await access.setPrincipalGrants(
        companyId,
        'user',
        existing.requestingUserId,
        grants,
        actor.type === 'board' ? actor.userId : null,
      )
    } else {
      const existingAgents = await agents.list(companyId)
      const managerId = resolveJoinRequestAgentManagerId(existingAgents)
      if (!managerId) {
        throw conflict('Join request cannot be approved because this company has no active CEO')
      }

      const agentName = deduplicateAgentName(
        existing.agentName ?? 'New Agent',
        existingAgents.map((a) => ({ id: a.id, name: a.name, status: a.status })),
      )

      const created = await agents.create(companyId, {
        name: agentName,
        role: 'general',
        title: null,
        status: 'idle',
        reportsTo: managerId,
        capabilities: existing.capabilities ?? null,
        adapterType: existing.adapterType ?? 'process',
        adapterConfig:
          existing.agentDefaultsPayload && typeof existing.agentDefaultsPayload === 'object'
            ? (existing.agentDefaultsPayload as Record<string, unknown>)
            : {},
        runtimeConfig: {},
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
        permissions: {},
        lastHeartbeatAt: null,
        metadata: null,
      })
      createdAgentId = created.id
      await access.ensureMembership(companyId, 'agent', created.id, 'member', 'active')
      const grants = agentJoinGrantsFromDefaults(
        invite.defaultsPayload as Record<string, unknown> | null,
      )
      await access.setPrincipalGrants(
        companyId,
        'agent',
        created.id,
        grants,
        actor.type === 'board' ? actor.userId : null,
      )
    }

    const approved = await db
      .update(joinRequests)
      .set({
        status: 'approved',
        approvedByUserId:
          actor.type === 'board'
            ? actor.userId
            : isLocalImplicit(actor)
              ? 'local-board'
              : null,
        approvedAt: new Date(),
        createdAgentId,
        updatedAt: new Date(),
      })
      .where(eq(joinRequests.id, requestId))
      .returning()
      .then((rows) => rows[0])

    await logActivity(db, {
      companyId,
      actorType: 'user',
      actorId: actor.type === 'board' ? actor.userId : 'board',
      action: 'join.approved',
      entityType: 'join_request',
      entityId: requestId,
      details: { requestType: existing.requestType, createdAgentId },
    })

    if (createdAgentId) {
      void notifyHireApproved(db, {
        companyId,
        agentId: createdAgentId,
        source: 'join_request',
        sourceId: requestId,
        approvedAt: new Date(),
      }).catch(() => {})
    }

    return NextResponse.json(toJoinRequestResponse(approved))
  } catch (err) {
    return handleError(err)
  }
}
