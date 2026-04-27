import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agents as agentsTable, issues as issuesTable, heartbeatRuns } from '@paperclipai/db'
import { and, eq } from 'drizzle-orm'
import { agentService, heartbeatService, logActivity } from '@/services/index'
import { wakeAgentSchema } from '@paperclipai/shared'
import { asNonEmptyString, asRecord } from '../../_shared'

export const maxDuration = 30

async function buildSkippedWakeupResponse(
  agent: NonNullable<Awaited<ReturnType<ReturnType<typeof agentService>['getById']>>>,
  payload: Record<string, unknown> | null | undefined,
) {
  const heartbeat = heartbeatService(db)
  const svc = agentService(db)

  const issueId = typeof payload?.issueId === 'string' && payload.issueId.trim() ? payload.issueId : null
  if (!issueId) {
    return { status: 'skipped' as const, reason: 'wakeup_skipped', message: 'Wakeup was skipped.', issueId: null, executionRunId: null, executionAgentId: null, executionAgentName: null }
  }

  const issue = await db
    .select({ id: issuesTable.id, executionRunId: issuesTable.executionRunId })
    .from(issuesTable)
    .where(and(eq(issuesTable.id, issueId), eq(issuesTable.companyId, agent.companyId)))
    .then((rows) => rows[0] ?? null)

  if (!issue?.executionRunId) {
    return { status: 'skipped' as const, reason: 'wakeup_skipped', message: 'Wakeup was skipped.', issueId, executionRunId: null, executionAgentId: null, executionAgentName: null }
  }

  const executionRun = await heartbeat.getRun(issue.executionRunId)
  if (!executionRun || (executionRun.status !== 'queued' && executionRun.status !== 'running')) {
    return { status: 'skipped' as const, reason: 'wakeup_skipped', message: 'Wakeup was skipped.', issueId, executionRunId: issue.executionRunId, executionAgentId: null, executionAgentName: null }
  }

  const executionAgent = await svc.getById(executionRun.agentId)
  const executionAgentName = executionAgent?.name ?? null
  return {
    status: 'skipped' as const,
    reason: 'issue_execution_deferred',
    message: executionAgentName
      ? `Wakeup was deferred because this issue is already being executed by ${executionAgentName}.`
      : 'Wakeup was deferred because this issue already has an active execution run.',
    issueId,
    executionRunId: executionRun.id,
    executionAgentId: executionRun.agentId,
    executionAgentName,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = agentService(db)
    const agent = await svc.getById(id)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    assertCompanyAccess(actor, agent.companyId)

    if (actor.type === 'agent' && actor.agentId !== id) {
      return NextResponse.json({ error: 'Agent can only invoke itself' }, { status: 403 })
    }

    const body = await parseBody(req, wakeAgentSchema)
    const heartbeat = heartbeatService(db)
    const run = await heartbeat.wakeup(id, {
      source: body.source,
      triggerDetail: body.triggerDetail ?? 'manual',
      reason: body.reason ?? null,
      payload: body.payload ?? null,
      idempotencyKey: body.idempotencyKey ?? null,
      requestedByActorType: actor.type === 'agent' ? 'agent' : 'user',
      requestedByActorId:
        actor.type === 'agent' ? actor.agentId ?? null : actor.type === 'board' ? actor.userId ?? null : null,
      contextSnapshot: {
        triggeredBy: actor.type,
        actorId: actor.type === 'agent' ? actor.agentId : actor.type === 'board' ? actor.userId : undefined,
        forceFreshSession: body.forceFreshSession === true,
      },
    })

    if (!run) {
      return NextResponse.json(await buildSkippedWakeupResponse(agent, body.payload ?? null), { status: 202 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'heartbeat.invoked',
      entityType: 'heartbeat_run',
      entityId: run.id,
      details: { agentId: id },
    })

    return NextResponse.json(run, { status: 202 })
  } catch (err) {
    return handleError(err)
  }
}
