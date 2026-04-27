import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import {
  issueService,
  heartbeatService,
  logActivity,
} from '@/services/index'
import { addIssueCommentSchema } from '@paperclipai/shared'

export const maxDuration = 30

const MAX_ISSUE_COMMENT_LIMIT = 500

async function normalizeIssueIdentifier(rawId: string): Promise<string> {
  const svc = issueService(db)
  if (/^[A-Z]+-\d+$/i.test(rawId)) {
    const issue = await svc.getByIdentifier(rawId)
    if (issue) return issue.id
  }
  return rawId
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    const sp = req.nextUrl.searchParams
    const afterRaw = sp.get('after') ?? sp.get('afterCommentId') ?? null
    const afterCommentId = afterRaw && afterRaw.trim().length > 0 ? afterRaw.trim() : null
    const orderRaw = sp.get('order') ?? ''
    const order = orderRaw.trim().toLowerCase() === 'asc' ? 'asc' : 'desc'
    const limitRaw = sp.get('limit')
    const limitNum = limitRaw ? Number(limitRaw) : null
    const limit =
      limitNum && Number.isFinite(limitNum) && limitNum > 0
        ? Math.min(Math.floor(limitNum), MAX_ISSUE_COMMENT_LIMIT)
        : null

    const comments = await svc.listComments(id, { afterCommentId, order, limit })
    return NextResponse.json(comments)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const heartbeat = heartbeatService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    // assertAgentRunCheckoutOwnership
    if (actor.type === 'agent') {
      const actorAgentId = actor.agentId
      if (!actorAgentId) {
        return NextResponse.json({ error: 'Agent authentication required' }, { status: 403 })
      }
      if (issue.status === 'in_progress' && issue.assigneeAgentId === actorAgentId) {
        const runId = actor.runId?.trim()
        if (!runId) {
          return NextResponse.json({ error: 'Agent run id required' }, { status: 401 })
        }
        await svc.assertCheckoutOwner(issue.id, actorAgentId, runId)
      }
    }

    const body = await parseBody(req, addIssueCommentSchema)
    const actorInfo = getActorInfo(actor)
    const reopenRequested = (body as Record<string, unknown>).reopen === true
    const interruptRequested = (body as Record<string, unknown>).interrupt === true
    const isClosed = issue.status === 'done' || issue.status === 'cancelled'
    let reopened = false
    let reopenFromStatus: string | null = null
    let interruptedRunId: string | null = null
    let currentIssue = issue

    if (reopenRequested && isClosed) {
      const reopenedIssue = await svc.update(id, { status: 'todo' })
      if (!reopenedIssue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
      reopened = true
      reopenFromStatus = issue.status
      currentIssue = reopenedIssue
      await logActivity(db, {
        companyId: currentIssue.companyId,
        actorType: actorInfo.actorType,
        actorId: actorInfo.actorId,
        agentId: actorInfo.agentId,
        runId: actorInfo.runId,
        action: 'issue.updated',
        entityType: 'issue',
        entityId: currentIssue.id,
        details: { status: 'todo', reopened: true, reopenedFrom: reopenFromStatus, source: 'comment', identifier: currentIssue.identifier },
      })
    }

    if (interruptRequested) {
      if (actor.type !== 'board') {
        return NextResponse.json({ error: 'Only board users can interrupt active runs from issue comments' }, { status: 403 })
      }
      const [directRun, agentRun] = await Promise.all([
        (currentIssue as Record<string, unknown>).executionRunId
          ? heartbeat.getRun((currentIssue as Record<string, unknown>).executionRunId as string)
          : Promise.resolve(null),
        currentIssue.assigneeAgentId
          ? heartbeat.getActiveRunForAgent(currentIssue.assigneeAgentId)
          : Promise.resolve(null),
      ])
      let runToInterrupt = directRun?.status === 'running' ? directRun : null
      if (!runToInterrupt && agentRun?.status === 'running') {
        const ctx = agentRun.contextSnapshot as Record<string, unknown> | null
        if (ctx && ctx.issueId === currentIssue.id) runToInterrupt = agentRun
      }
      if (runToInterrupt) {
        const cancelled = await heartbeat.cancelRun(runToInterrupt.id)
        if (cancelled) {
          interruptedRunId = cancelled.id
          await logActivity(db, {
            companyId: cancelled.companyId,
            actorType: actorInfo.actorType,
            actorId: actorInfo.actorId,
            agentId: actorInfo.agentId,
            runId: actorInfo.runId,
            action: 'heartbeat.cancelled',
            entityType: 'heartbeat_run',
            entityId: cancelled.id,
            details: { agentId: cancelled.agentId, source: 'issue_comment_interrupt', issueId: currentIssue.id },
          })
        }
      }
    }

    const comment = await svc.addComment(id, (body as Record<string, unknown>).body as string, {
      agentId: actorInfo.agentId ?? undefined,
      userId: actorInfo.actorType === 'user' ? actorInfo.actorId : undefined,
      runId: actorInfo.runId,
    })

    if (actorInfo.runId) {
      await heartbeat.reportRunActivity(actorInfo.runId).catch((err: unknown) =>
        console.warn({ err, runId: actorInfo.runId }, 'failed to clear detached run warning after issue comment'))
    }

    await logActivity(db, {
      companyId: currentIssue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.comment_added',
      entityType: 'issue',
      entityId: currentIssue.id,
      details: {
        commentId: comment.id,
        bodySnippet: comment.body.slice(0, 120),
        identifier: currentIssue.identifier,
        issueTitle: currentIssue.title,
        ...(reopened ? { reopened: true, reopenedFrom: reopenFromStatus, source: 'comment' } : {}),
        ...(interruptedRunId ? { interruptedRunId } : {}),
      },
    })

    void (async () => {
      const wakeups = new Map<string, Parameters<typeof heartbeat.wakeup>[1]>()
      const assigneeId = currentIssue.assigneeAgentId
      const actorIsAgent = actorInfo.actorType === 'agent'
      const selfComment = actorIsAgent && actorInfo.actorId === assigneeId
      const skipWake = selfComment || isClosed
      if (assigneeId && (reopened || !skipWake)) {
        if (reopened) {
          wakeups.set(assigneeId, {
            source: 'automation', triggerDetail: 'system', reason: 'issue_reopened_via_comment',
            payload: { issueId: currentIssue.id, commentId: comment.id, reopenedFrom: reopenFromStatus, mutation: 'comment', ...(interruptedRunId ? { interruptedRunId } : {}) },
            requestedByActorType: actorInfo.actorType, requestedByActorId: actorInfo.actorId,
            contextSnapshot: { issueId: currentIssue.id, taskId: currentIssue.id, commentId: comment.id, source: 'issue.comment.reopen', wakeReason: 'issue_reopened_via_comment', reopenedFrom: reopenFromStatus, ...(interruptedRunId ? { interruptedRunId } : {}) },
          })
        } else {
          wakeups.set(assigneeId, {
            source: 'automation', triggerDetail: 'system', reason: 'issue_commented',
            payload: { issueId: currentIssue.id, commentId: comment.id, mutation: 'comment', ...(interruptedRunId ? { interruptedRunId } : {}) },
            requestedByActorType: actorInfo.actorType, requestedByActorId: actorInfo.actorId,
            contextSnapshot: { issueId: currentIssue.id, taskId: currentIssue.id, commentId: comment.id, source: 'issue.comment', wakeReason: 'issue_commented', ...(interruptedRunId ? { interruptedRunId } : {}) },
          })
        }
      }
      let mentionedIds: string[] = []
      try {
        mentionedIds = await svc.findMentionedAgents(issue.companyId, (body as Record<string, unknown>).body as string)
      } catch { /* ignore */ }
      for (const mentionedId of mentionedIds) {
        if (wakeups.has(mentionedId)) continue
        if (actorIsAgent && actorInfo.actorId === mentionedId) continue
        wakeups.set(mentionedId, {
          source: 'automation', triggerDetail: 'system', reason: 'issue_comment_mentioned',
          payload: { issueId: id, commentId: comment.id },
          requestedByActorType: actorInfo.actorType, requestedByActorId: actorInfo.actorId,
          contextSnapshot: { issueId: id, taskId: id, commentId: comment.id, wakeCommentId: comment.id, wakeReason: 'issue_comment_mentioned', source: 'comment.mention' },
        })
      }
      for (const [agentId, wakeup] of wakeups.entries()) {
        heartbeat.wakeup(agentId, wakeup).catch((err: unknown) =>
          console.warn({ err, issueId: currentIssue.id, agentId }, 'failed to wake agent on issue comment'))
      }
    })()

    return NextResponse.json(comment, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
