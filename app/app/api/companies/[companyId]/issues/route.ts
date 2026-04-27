import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError, forbidden, HttpError } from '@/server/errors'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import {
  issueService,
  accessService,
  agentService,
  heartbeatService,
  logActivity,
} from '@/services/index'
import { queueIssueAssignmentWakeup } from '@/services/issue-assignment-wakeup'
import { createIssueSchema } from '@paperclipai/shared'
import { unauthorized } from '@/server/errors'

export const maxDuration = 30

const ISSUE_LIST_TTL = 15

async function assertCanAssignTasks(
  actor: Awaited<ReturnType<typeof resolveActor>>,
  companyId: string,
) {
  const access = accessService(db)
  const agentsSvc = agentService(db)
  assertCompanyAccess(actor, companyId)
  if (actor.type === 'board') {
    if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
    const allowed = await access.canUser(companyId, actor.userId, 'tasks:assign')
    if (!allowed) throw forbidden('Missing permission: tasks:assign')
    return
  }
  if (actor.type === 'agent') {
    if (!actor.agentId) throw forbidden('Agent authentication required')
    const allowedByGrant = await access.hasPermission(companyId, 'agent', actor.agentId, 'tasks:assign')
    if (allowedByGrant) return
    const actorAgent = await agentsSvc.getById(actor.agentId)
    function canCreateAgentsLegacy(agent: { permissions: Record<string, unknown> | null | undefined; role: string }) {
      if (agent.role === 'ceo') return true
      if (!agent.permissions || typeof agent.permissions !== 'object') return false
      return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents)
    }
    if (actorAgent && actorAgent.companyId === companyId && canCreateAgentsLegacy(actorAgent)) return
    throw forbidden('Missing permission: tasks:assign')
  }
  throw unauthorized()
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const sp = req.nextUrl.searchParams
    const assigneeUserFilterRaw = sp.get('assigneeUserId') ?? undefined
    const touchedByUserFilterRaw = sp.get('touchedByUserId') ?? undefined
    const inboxArchivedByUserFilterRaw = sp.get('inboxArchivedByUserId') ?? undefined
    const unreadForUserFilterRaw = sp.get('unreadForUserId') ?? undefined

    const assigneeUserId =
      assigneeUserFilterRaw === 'me' && actor.type === 'board'
        ? actor.userId
        : assigneeUserFilterRaw
    const touchedByUserId =
      touchedByUserFilterRaw === 'me' && actor.type === 'board'
        ? actor.userId
        : touchedByUserFilterRaw
    const inboxArchivedByUserId =
      inboxArchivedByUserFilterRaw === 'me' && actor.type === 'board'
        ? actor.userId
        : inboxArchivedByUserFilterRaw
    const unreadForUserId =
      unreadForUserFilterRaw === 'me' && actor.type === 'board'
        ? actor.userId
        : unreadForUserFilterRaw

    if (assigneeUserFilterRaw === 'me' && (!assigneeUserId || actor.type !== 'board')) {
      return NextResponse.json({ error: 'assigneeUserId=me requires board authentication' }, { status: 403 })
    }
    if (touchedByUserFilterRaw === 'me' && (!touchedByUserId || actor.type !== 'board')) {
      return NextResponse.json({ error: 'touchedByUserId=me requires board authentication' }, { status: 403 })
    }
    if (inboxArchivedByUserFilterRaw === 'me' && (!inboxArchivedByUserId || actor.type !== 'board')) {
      return NextResponse.json({ error: 'inboxArchivedByUserId=me requires board authentication' }, { status: 403 })
    }
    if (unreadForUserFilterRaw === 'me' && (!unreadForUserId || actor.type !== 'board')) {
      return NextResponse.json({ error: 'unreadForUserId=me requires board authentication' }, { status: 403 })
    }

    const limitRaw = Number(sp.get('limit'))
    const offsetRaw = Number(sp.get('offset'))
    const listParams = {
      status: sp.get('status') ?? undefined,
      assigneeAgentId: sp.get('assigneeAgentId') ?? undefined,
      participantAgentId: sp.get('participantAgentId') ?? undefined,
      assigneeUserId,
      touchedByUserId,
      inboxArchivedByUserId,
      unreadForUserId,
      projectId: sp.get('projectId') ?? undefined,
      executionWorkspaceId: sp.get('executionWorkspaceId') ?? undefined,
      parentId: sp.get('parentId') ?? undefined,
      labelId: sp.get('labelId') ?? undefined,
      originKind: sp.get('originKind') ?? undefined,
      originId: sp.get('originId') ?? undefined,
      includeRoutineExecutions: sp.get('includeRoutineExecutions') === 'true' || sp.get('includeRoutineExecutions') === '1',
      sprintId: sp.get('sprintId') ?? undefined,
      noSprint: sp.get('noSprint') === 'true' || sp.get('noSprint') === '1',
      q: sp.get('q') ?? undefined,
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 2000) : undefined,
      offset: Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : undefined,
    }

    const listCacheKey = `issues-list:${companyId}:${JSON.stringify(Object.entries(listParams).sort())}`
    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        const cached = await redis.get(listCacheKey).catch(() => null)
        if (cached) return NextResponse.json(JSON.parse(cached))
      }
    } catch { /* redis unavailable */ }

    const svc = issueService(db)
    const result = await svc.list(companyId, listParams)

    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        await redis.set(listCacheKey, JSON.stringify(result), { EX: ISSUE_LIST_TTL }).catch(() => null)
      }
    } catch { /* redis unavailable */ }

    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const body = await parseBody(req, createIssueSchema)
    const svc = issueService(db)
    const heartbeat = heartbeatService(db)

    if (body.parentId) {
      const parentAncestors = await svc.getAncestors(body.parentId)
      if (parentAncestors.length >= 2) {
        return NextResponse.json({ error: 'Sub-issue nesting limit reached (max depth: 3)' }, { status: 422 })
      }
    }

    if (body.assigneeAgentId || body.assigneeUserId) {
      await assertCanAssignTasks(actor, companyId)
    }

    const actorInfo = getActorInfo(actor)
    const issue = await svc.create(companyId, {
      ...body,
      createdByAgentId: actorInfo.agentId,
      createdByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
    })

    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.created',
      entityType: 'issue',
      entityId: issue.id,
      details: { title: issue.title, identifier: issue.identifier },
    })

    void queueIssueAssignmentWakeup({
      heartbeat,
      issue,
      reason: 'issue_assigned',
      mutation: 'create',
      contextSource: 'issue.create',
      requestedByActorType: actorInfo.actorType,
      requestedByActorId: actorInfo.actorId,
    })

    return NextResponse.json(issue, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
