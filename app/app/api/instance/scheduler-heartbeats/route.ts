import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { agents as agentsTable, companies } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertInstanceAdmin } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { deriveAgentUrlKey } from '@paperclipai/shared'
import type { InstanceSchedulerHeartbeatAgent } from '@paperclipai/shared'
import { parseSchedulerHeartbeatPolicy } from '../../agents/_shared'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertInstanceAdmin(actor)

    const rows = await db
      .select({
        id: agentsTable.id,
        companyId: agentsTable.companyId,
        agentName: agentsTable.name,
        role: agentsTable.role,
        title: agentsTable.title,
        status: agentsTable.status,
        adapterType: agentsTable.adapterType,
        runtimeConfig: agentsTable.runtimeConfig,
        lastHeartbeatAt: agentsTable.lastHeartbeatAt,
        companyName: companies.name,
        companyIssuePrefix: companies.issuePrefix,
      })
      .from(agentsTable)
      .innerJoin(companies, eq(agentsTable.companyId, companies.id))
      .orderBy(companies.name, agentsTable.name)

    const items: InstanceSchedulerHeartbeatAgent[] = rows
      .map((row) => {
        const policy = parseSchedulerHeartbeatPolicy(row.runtimeConfig)
        const statusEligible =
          row.status !== 'paused' && row.status !== 'terminated' && row.status !== 'pending_approval'
        return {
          id: row.id,
          companyId: row.companyId,
          companyName: row.companyName,
          companyIssuePrefix: row.companyIssuePrefix,
          agentName: row.agentName,
          agentUrlKey: deriveAgentUrlKey(row.agentName, row.id),
          role: row.role as InstanceSchedulerHeartbeatAgent['role'],
          title: row.title,
          status: row.status as InstanceSchedulerHeartbeatAgent['status'],
          adapterType: row.adapterType,
          intervalSec: policy.intervalSec,
          heartbeatEnabled: policy.enabled,
          schedulerActive: statusEligible && policy.enabled && policy.intervalSec > 0,
          lastHeartbeatAt: row.lastHeartbeatAt,
        }
      })
      .filter((item) =>
        item.status !== 'paused' && item.status !== 'terminated' && item.status !== 'pending_approval',
      )
      .sort((left, right) => {
        if (left.schedulerActive !== right.schedulerActive) return left.schedulerActive ? -1 : 1
        const companyOrder = left.companyName.localeCompare(right.companyName)
        if (companyOrder !== 0) return companyOrder
        return left.agentName.localeCompare(right.agentName)
      })

    return NextResponse.json(items)
  } catch (err) {
    return handleError(err)
  }
}
