import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { issueStateHistory } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError, forbidden, unauthorized, HttpError } from '@/server/errors'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import {
  issueService,
  accessService,
  agentService,
  heartbeatService,
  documentService,
  executionWorkspaceService,
  workProductService,
  projectService,
  goalService,
  routineService,
  logActivity,
  pipelineService,
} from '@/services/index'
import { updateIssueSchema } from '@paperclipai/shared'
import { trackAgentTaskCompleted } from '@paperclipai/shared/telemetry'
import { getTelemetryClient } from '@/telemetry'
import { createStorageService } from '@/lib/storage'
import { shouldWakeAssigneeOnCheckout } from '@/server/issues-checkout-wakeup'

export const maxDuration = 30

const ISSUE_DETAIL_TTL = 20

const updateIssueRouteSchema = updateIssueSchema.extend({
  interrupt: z.boolean().optional(),
})

async function normalizeIssueIdentifier(rawId: string): Promise<string> {
  const svc = issueService(db)
  if (/^[A-Z]+-\d+$/i.test(rawId)) {
    const issue = await svc.getByIdentifier(rawId)
    if (issue) return issue.id
  }
  return rawId
}

async function resolveIssueProjectAndGoal(issue: {
  companyId: string
  projectId: string | null
  goalId: string | null
}) {
  const projectsSvc = projectService(db)
  const goalsSvc = goalService(db)
  const projectPromise = issue.projectId ? projectsSvc.getById(issue.projectId) : Promise.resolve(null)
  const directGoalPromise = issue.goalId ? goalsSvc.getById(issue.goalId) : Promise.resolve(null)
  const [project, directGoal] = await Promise.all([projectPromise, directGoalPromise])

  if (directGoal) return { project, goal: directGoal }

  const projectGoalId = (project as { goalId?: string | null; goalIds?: string[] } | null)?.goalId
    ?? (project as { goalId?: string | null; goalIds?: string[] } | null)?.goalIds?.[0]
    ?? null
  if (projectGoalId) {
    const projectGoal = await goalsSvc.getById(projectGoalId)
    return { project, goal: projectGoal }
  }

  if (!issue.projectId) {
    const defaultGoal = await goalsSvc.getDefaultCompanyGoal(issue.companyId)
    return { project, goal: defaultGoal }
  }

  return { project, goal: null }
}

async function resolveActiveIssueRun(
  heartbeat: ReturnType<typeof heartbeatService>,
  issue: { id: string; assigneeAgentId: string | null; executionRunId?: string | null },
) {
  const [directRun, agentRun] = await Promise.all([
    issue.executionRunId ? heartbeat.getRun(issue.executionRunId) : Promise.resolve(null),
    issue.assigneeAgentId ? heartbeat.getActiveRunForAgent(issue.assigneeAgentId) : Promise.resolve(null),
  ])

  if (directRun?.status === 'running') return directRun

  if (agentRun?.status === 'running') {
    const activeIssueId =
      agentRun.contextSnapshot &&
      typeof agentRun.contextSnapshot === 'object' &&
      typeof (agentRun.contextSnapshot as Record<string, unknown>).issueId === 'string'
        ? ((agentRun.contextSnapshot as Record<string, unknown>).issueId as string)
        : null
    if (activeIssueId === issue.id) return agentRun
  }

  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const cacheKey = `issue:${id}`
    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        const cached = await redis.get(cacheKey).catch(() => null)
        if (cached) return NextResponse.json(JSON.parse(cached))
      }
    } catch { /* redis unavailable */ }

    const svc = issueService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    const projectsSvc = projectService(db)
    const executionWorkspacesSvc = executionWorkspaceService(db)
    const workProductsSvc = workProductService(db)
    const documentsSvc = documentService(db)

    const [{ project, goal }, ancestors, mentionedProjectIds, documentPayload] = await Promise.all([
      resolveIssueProjectAndGoal(issue),
      svc.getAncestors(issue.id),
      svc.findMentionedProjectIds(issue.id),
      documentsSvc.getIssueDocumentPayload(issue),
    ])
    const [mentionedProjects, currentExecutionWorkspace, workProducts] = await Promise.all([
      mentionedProjectIds.length > 0
        ? projectsSvc.listByIds(issue.companyId, mentionedProjectIds)
        : Promise.resolve([]),
      issue.executionWorkspaceId
        ? executionWorkspacesSvc.getById(issue.executionWorkspaceId)
        : Promise.resolve(null),
      workProductsSvc.listForIssue(issue.id),
    ])

    const payload = {
      ...issue,
      goalId: goal?.id ?? issue.goalId,
      ancestors,
      ...documentPayload,
      project: project ?? null,
      goal: goal ?? null,
      mentionedProjects,
      currentExecutionWorkspace,
      workProducts,
    }

    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        await redis.set(cacheKey, JSON.stringify(payload), { EX: ISSUE_DETAIL_TTL }).catch(() => null)
      }
    } catch { /* redis unavailable */ }

    return NextResponse.json(payload)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const access = accessService(db)
    const agentsSvc = agentService(db)
    const heartbeat = heartbeatService(db)
    const routinesSvc = routineService(db)
    const pipelineSvc = pipelineService(db)

    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)

    const body = await parseBody(req, updateIssueRouteSchema)

    // PERM-01/PERM-02: Member permission gates
    if (actor.type === 'board' && actor.userId) {
      const isLocalOrAdmin = actor.source === 'local_implicit' || actor.isInstanceAdmin
      if (!isLocalOrAdmin) {
        const membership = await access.getMembership(existing.companyId, 'user', actor.userId)
        const memberRole = membership?.membershipRole
        if (memberRole === 'member' && existing.assigneeUserId !== actor.userId) {
          throw forbidden('Members can only mutate their own tasks')
        }
        if (memberRole === 'member' && body.assigneeAgentId !== undefined && body.assigneeAgentId !== null) {
          throw forbidden('Members cannot assign issues to AI agents')
        }
      }
    }

    const assigneeWillChange =
      (body.assigneeAgentId !== undefined && body.assigneeAgentId !== existing.assigneeAgentId) ||
      (body.assigneeUserId !== undefined && body.assigneeUserId !== existing.assigneeUserId)

    const isAgentReturningIssueToCreator =
      actor.type === 'agent' &&
      !!actor.agentId &&
      existing.assigneeAgentId === actor.agentId &&
      body.assigneeAgentId === null &&
      typeof body.assigneeUserId === 'string' &&
      !!existing.createdByUserId &&
      body.assigneeUserId === existing.createdByUserId

    if (assigneeWillChange && !isAgentReturningIssueToCreator) {
      const canAssign = await (async () => {
        assertCompanyAccess(actor, existing.companyId)
        if (actor.type === 'board') {
          if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
          const allowed = await access.canUser(existing.companyId, actor.userId, 'tasks:assign')
          if (!allowed) throw forbidden('Missing permission: tasks:assign')
          return
        }
        if (actor.type === 'agent') {
          if (!actor.agentId) throw forbidden('Agent authentication required')
          const allowedByGrant = await access.hasPermission(existing.companyId, 'agent', actor.agentId, 'tasks:assign')
          if (allowedByGrant) return
          const actorAgent = await agentsSvc.getById(actor.agentId)
          function canCreateAgentsLegacy(agent: { permissions: Record<string, unknown> | null | undefined; role: string }) {
            if (agent.role === 'ceo') return true
            if (!agent.permissions || typeof agent.permissions !== 'object') return false
            return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents)
          }
          if (actorAgent && actorAgent.companyId === existing.companyId && canCreateAgentsLegacy(actorAgent)) return
          throw forbidden('Missing permission: tasks:assign')
        }
        throw unauthorized()
      })()
      void canAssign
    }

    // assertAgentRunCheckoutOwnership
    if (actor.type === 'agent') {
      const actorAgentId = actor.agentId
      if (!actorAgentId) {
        return NextResponse.json({ error: 'Agent authentication required' }, { status: 403 })
      }
      if (existing.status === 'in_progress' && existing.assigneeAgentId === actorAgentId) {
        const runId = actor.runId?.trim()
        if (!runId) {
          return NextResponse.json({ error: 'Agent run id required' }, { status: 401 })
        }
        const ownership = await svc.assertCheckoutOwner(existing.id, actorAgentId, runId)
        if (ownership.adoptedFromRunId) {
          const actorInfo = getActorInfo(actor)
          await logActivity(db, {
            companyId: existing.companyId,
            actorType: actorInfo.actorType,
            actorId: actorInfo.actorId,
            agentId: actorInfo.agentId,
            runId: actorInfo.runId,
            action: 'issue.checkout_lock_adopted',
            entityType: 'issue',
            entityId: existing.id,
            details: {
              previousCheckoutRunId: ownership.adoptedFromRunId,
              checkoutRunId: runId,
              reason: 'stale_checkout_run',
            },
          })
        }
      }
    }

    const actor2 = getActorInfo(actor)
    const isClosed = existing.status === 'done' || existing.status === 'cancelled'
    const {
      comment: commentBody,
      reopen: reopenRequested,
      interrupt: interruptRequested,
      hiddenAt: hiddenAtRaw,
      ...updateFields
    } = body as typeof body & { comment?: string; reopen?: boolean; interrupt?: boolean; hiddenAt?: string | null }

    let interruptedRunId: string | null = null

    if (interruptRequested) {
      if (!commentBody) {
        return NextResponse.json({ error: 'Interrupt is only supported when posting a comment' }, { status: 400 })
      }
      if (actor.type !== 'board') {
        return NextResponse.json({ error: 'Only board users can interrupt active runs from issue comments' }, { status: 403 })
      }
      const runToInterrupt = await resolveActiveIssueRun(heartbeat, existing)
      if (runToInterrupt) {
        const cancelled = await heartbeat.cancelRun(runToInterrupt.id)
        if (cancelled) {
          interruptedRunId = cancelled.id
          await logActivity(db, {
            companyId: cancelled.companyId,
            actorType: actor2.actorType,
            actorId: actor2.actorId,
            agentId: actor2.agentId,
            runId: actor2.runId,
            action: 'heartbeat.cancelled',
            entityType: 'heartbeat_run',
            entityId: cancelled.id,
            details: { agentId: cancelled.agentId, source: 'issue_comment_interrupt', issueId: existing.id },
          })
        }
      }
    }

    const finalUpdateFields: Record<string, unknown> = { ...updateFields }
    if (hiddenAtRaw !== undefined) {
      finalUpdateFields.hiddenAt = hiddenAtRaw ? new Date(hiddenAtRaw) : null
    }
    if (commentBody && reopenRequested === true && isClosed && finalUpdateFields.status === undefined) {
      finalUpdateFields.status = 'todo'
    }

    let issue
    try {
      issue = await svc.update(id, finalUpdateFields)
    } catch (err) {
      if (err instanceof HttpError && err.status === 422) {
        console.warn('[issue PATCH] rejected with 422', { issueId: id, error: (err as Error).message })
      }
      throw err
    }

    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })

    // Record state history if status changed
    if (finalUpdateFields.status && finalUpdateFields.status !== existing.status) {
      const durationMs = existing.updatedAt ? Date.now() - new Date(existing.updatedAt).getTime() : null
      await db.insert(issueStateHistory).values({
        issueId: id,
        sprintId: existing.sprintId ?? null,
        fromStatus: existing.status,
        toStatus: finalUpdateFields.status as string,
        changedByType: actor2.actorType,
        changedById: actor2.actorId,
        durationMs,
      })
    }

    await routinesSvc.syncRunStatusForIssue(issue.id)

    if (actor2.runId) {
      await heartbeat.reportRunActivity(actor2.runId).catch((err: unknown) =>
        console.warn({ err, runId: actor2.runId }, 'failed to clear detached run warning after issue activity'))
    }

    const previous: Record<string, unknown> = {}
    for (const key of Object.keys(finalUpdateFields)) {
      if (key in existing && (existing as Record<string, unknown>)[key] !== (finalUpdateFields)[key]) {
        previous[key] = (existing as Record<string, unknown>)[key]
      }
    }

    const hasFieldChanges = Object.keys(previous).length > 0
    const reopened =
      commentBody &&
      reopenRequested === true &&
      isClosed &&
      previous.status !== undefined &&
      issue.status === 'todo'
    const reopenFromStatus = reopened ? existing.status : null

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor2.actorType,
      actorId: actor2.actorId,
      agentId: actor2.agentId,
      runId: actor2.runId,
      action: 'issue.updated',
      entityType: 'issue',
      entityId: issue.id,
      details: {
        ...finalUpdateFields,
        identifier: issue.identifier,
        ...(commentBody ? { source: 'comment' } : {}),
        ...(reopened ? { reopened: true, reopenedFrom: reopenFromStatus } : {}),
        ...(interruptedRunId ? { interruptedRunId } : {}),
        _previous: hasFieldChanges ? previous : undefined,
      },
    })

    if (issue.status === 'done' && existing.status !== 'done') {
      const tc = getTelemetryClient()
      if (tc && actor2.agentId) {
        const agentsSvc2 = agentService(db)
        const actorAgent = await agentsSvc2.getById(actor2.agentId)
        if (actorAgent) trackAgentTaskCompleted(tc, { agentRole: actorAgent.role })
      }
      pipelineSvc.onIssueStatusChange(issue.id, issue.companyId).catch((err: unknown) =>
        console.warn({ err, issueId: issue.id }, 'pipeline hook error'))
    }

    let comment = null
    if (commentBody) {
      comment = await svc.addComment(id, commentBody, {
        agentId: actor2.agentId ?? undefined,
        userId: actor2.actorType === 'user' ? actor2.actorId : undefined,
        runId: actor2.runId,
      })
      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor2.actorType,
        actorId: actor2.actorId,
        agentId: actor2.agentId,
        runId: actor2.runId,
        action: 'issue.comment_added',
        entityType: 'issue',
        entityId: issue.id,
        details: {
          commentId: comment.id,
          bodySnippet: comment.body.slice(0, 120),
          identifier: issue.identifier,
          issueTitle: issue.title,
          ...(reopened ? { reopened: true, reopenedFrom: reopenFromStatus, source: 'comment' } : {}),
          ...(interruptedRunId ? { interruptedRunId } : {}),
          ...(hasFieldChanges ? { updated: true } : {}),
        },
      })
    }

    const assigneeChanged = assigneeWillChange
    const statusChangedFromBacklog =
      existing.status === 'backlog' && issue.status !== 'backlog' && body.status !== undefined

    void (async () => {
      const wakeups = new Map<string, Parameters<typeof heartbeat.wakeup>[1]>()

      if (assigneeChanged && issue.assigneeAgentId && issue.status !== 'backlog') {
        wakeups.set(issue.assigneeAgentId, {
          source: 'assignment',
          triggerDetail: 'system',
          reason: 'issue_assigned',
          payload: { issueId: issue.id, mutation: 'update', ...(interruptedRunId ? { interruptedRunId } : {}) },
          requestedByActorType: actor2.actorType,
          requestedByActorId: actor2.actorId,
          contextSnapshot: { issueId: issue.id, source: 'issue.update', ...(interruptedRunId ? { interruptedRunId } : {}) },
        })
      }

      if (!assigneeChanged && statusChangedFromBacklog && issue.assigneeAgentId) {
        wakeups.set(issue.assigneeAgentId, {
          source: 'automation',
          triggerDetail: 'system',
          reason: 'issue_status_changed',
          payload: { issueId: issue.id, mutation: 'update', ...(interruptedRunId ? { interruptedRunId } : {}) },
          requestedByActorType: actor2.actorType,
          requestedByActorId: actor2.actorId,
          contextSnapshot: { issueId: issue.id, source: 'issue.status_change', ...(interruptedRunId ? { interruptedRunId } : {}) },
        })
      }

      if (commentBody && comment) {
        let mentionedIds: string[] = []
        try {
          mentionedIds = await svc.findMentionedAgents(issue.companyId, commentBody)
        } catch { /* ignore */ }

        for (const mentionedId of mentionedIds) {
          if (wakeups.has(mentionedId)) continue
          if (actor2.actorType === 'agent' && actor2.actorId === mentionedId) continue
          wakeups.set(mentionedId, {
            source: 'automation',
            triggerDetail: 'system',
            reason: 'issue_comment_mentioned',
            payload: { issueId: id, commentId: comment.id },
            requestedByActorType: actor2.actorType,
            requestedByActorId: actor2.actorId,
            contextSnapshot: {
              issueId: id, taskId: id, commentId: comment.id,
              wakeCommentId: comment.id, wakeReason: 'issue_comment_mentioned', source: 'comment.mention',
            },
          })
        }
      }

      for (const [agentId, wakeup] of wakeups.entries()) {
        heartbeat.wakeup(agentId, wakeup).catch((err: unknown) =>
          console.warn({ err, issueId: issue.id, agentId }, 'failed to wake agent on issue update'))
      }
    })()

    try {
      const redis = await getRedis()
      if (redis?.isReady) await redis.del(`issue:${id}`).catch(() => null)
    } catch { /* redis unavailable */ }

    return NextResponse.json({ ...issue, comment })
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)

    const storage = createStorageService()
    const attachments = await svc.listAttachments(id)
    const issue = await svc.remove(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })

    for (const attachment of attachments) {
      try {
        await storage.deleteObject(attachment.companyId, attachment.objectKey)
      } catch (err) {
        console.warn({ err, issueId: id, attachmentId: attachment.id }, 'failed to delete attachment object during issue delete')
      }
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.deleted',
      entityType: 'issue',
      entityId: issue.id,
      details: { identifier: issue.identifier, title: issue.title },
    })

    try {
      const redis = await getRedis()
      if (redis?.isReady) await redis.del(`issue:${id}`).catch(() => null)
    } catch { /* redis unavailable */ }

    return NextResponse.json(issue)
  } catch (err) {
    return handleError(err)
  }
}
