import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { and, eq, inArray, not, sql } from 'drizzle-orm'
import { joinRequests, issues } from '@paperclipai/db'
import { sidebarBadgeService, accessService, dashboardService } from '@/services/index'

export const maxDuration = 30

const SIDEBAR_TTL_SECONDS = 20

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const actorKey =
      actor.type === 'board' && actor.userId
        ? `user:${actor.userId}`
        : actor.type === 'agent' && actor.agentId
          ? `agent:${actor.agentId}`
          : 'anon'
    const cacheKey = `sidebar-badges:${companyId}:${actorKey}`

    let redis: Awaited<ReturnType<typeof getRedis>> | null = null
    try {
      redis = await getRedis()
    } catch {
      // Redis unavailable — proceed without cache
    }

    if (redis?.isReady) {
      const cached = await redis.get(cacheKey).catch(() => null)
      if (cached) {
        return NextResponse.json(JSON.parse(cached))
      }
    }

    const access = accessService(db)

    let canApproveJoins = false
    if (actor.type === 'board') {
      canApproveJoins =
        actor.source === 'local_implicit' ||
        Boolean(actor.isInstanceAdmin) ||
        (await access.canUser(companyId, actor.userId, 'joins:approve'))
    } else if (actor.type === 'agent' && actor.agentId) {
      canApproveJoins = await access.hasPermission(companyId, 'agent', actor.agentId, 'joins:approve')
    }

    const joinRequestCount = canApproveJoins
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(joinRequests)
          .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.status, 'pending_approval')))
          .then((rows) => Number(rows[0]?.count ?? 0))
      : 0

    let myTasksCount = 0
    if (actor.type === 'board' && actor.userId) {
      const myTasksRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.assigneeUserId, actor.userId),
            not(inArray(issues.status, ['done', 'cancelled'])),
          ),
        )
      myTasksCount = Number(myTasksRows[0]?.count ?? 0)
    }

    const svc = sidebarBadgeService(db)
    const dashboard = dashboardService(db)

    const badges = await svc.get(companyId, {
      joinRequests: joinRequestCount,
      myTasks: myTasksCount,
    })
    const summary = await dashboard.summary(companyId)
    const hasFailedRuns = badges.failedRuns > 0
    const alertsCount =
      (summary.agents.error > 0 && !hasFailedRuns ? 1 : 0) +
      (summary.costs.monthBudgetCents > 0 && summary.costs.monthUtilizationPercent >= 80 ? 1 : 0)
    badges.inbox = badges.failedRuns + alertsCount + joinRequestCount + badges.approvals

    if (redis?.isReady) {
      await redis
        .set(cacheKey, JSON.stringify(badges), { EX: SIDEBAR_TTL_SECONDS })
        .catch(() => console.warn('[redis] failed to cache sidebar-badges'))
    }

    return NextResponse.json(badges)
  } catch (err) {
    return handleError(err)
  }
}
