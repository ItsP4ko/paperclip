import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, inArray, not, sql } from 'drizzle-orm'
import { agents as agentsTable, heartbeatRuns } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const minCountParam = req.nextUrl.searchParams.get('minCount')
    const minCount = minCountParam ? Math.max(0, Math.min(20, parseInt(minCountParam, 10) || 0)) : 0

    const columns = {
      id: heartbeatRuns.id,
      status: heartbeatRuns.status,
      invocationSource: heartbeatRuns.invocationSource,
      triggerDetail: heartbeatRuns.triggerDetail,
      startedAt: heartbeatRuns.startedAt,
      finishedAt: heartbeatRuns.finishedAt,
      createdAt: heartbeatRuns.createdAt,
      agentId: heartbeatRuns.agentId,
      agentName: agentsTable.name,
      adapterType: agentsTable.adapterType,
      issueId: sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'issueId'`.as('issueId'),
    }

    const liveRuns = await db
      .select(columns)
      .from(heartbeatRuns)
      .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
      .where(
        and(
          eq(heartbeatRuns.companyId, companyId),
          inArray(heartbeatRuns.status, ['queued', 'running']),
        ),
      )
      .orderBy(desc(heartbeatRuns.createdAt))

    if (minCount > 0 && liveRuns.length < minCount) {
      const activeIds = liveRuns.map((r) => r.id)
      const recentRuns = await db
        .select(columns)
        .from(heartbeatRuns)
        .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            not(inArray(heartbeatRuns.status, ['queued', 'running'])),
            ...(activeIds.length > 0 ? [not(inArray(heartbeatRuns.id, activeIds))] : []),
          ),
        )
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(minCount - liveRuns.length)

      return NextResponse.json([...liveRuns, ...recentRuns])
    }

    return NextResponse.json(liveRuns)
  } catch (err) {
    return handleError(err)
  }
}
