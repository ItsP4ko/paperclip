import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { approvalService, heartbeatService, issueApprovalService, logActivity } from '@/services/index'
import { resolveApprovalSchema } from '@paperclipai/shared'
import { redactEventPayload } from '@/redaction'
import { logger } from '@/server/logger'

function redactApprovalPayload<T extends { payload: Record<string, unknown> }>(approval: T): T {
  return {
    ...approval,
    payload: redactEventPayload(approval.payload) ?? {},
  }
}

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { id } = await params
    const body = await parseBody(req, resolveApprovalSchema) as {
      decidedByUserId?: string
      decisionNote?: string
    }
    const svc = approvalService(db)
    const { approval, applied } = await svc.approve(
      id,
      body.decidedByUserId ?? 'board',
      body.decisionNote,
    )

    if (applied) {
      const issueApprovalsSvc = issueApprovalService(db)
      const linkedIssues = await issueApprovalsSvc.listIssuesForApproval(approval.id)
      const linkedIssueIds = linkedIssues.map((issue) => issue.id)
      const primaryIssueId = linkedIssueIds[0] ?? null

      await logActivity(db, {
        companyId: approval.companyId,
        actorType: 'user',
        actorId: actor.userId ?? 'board',
        action: 'approval.approved',
        entityType: 'approval',
        entityId: approval.id,
        details: {
          type: approval.type,
          requestedByAgentId: approval.requestedByAgentId,
          linkedIssueIds,
        },
      })

      if (approval.requestedByAgentId) {
        const heartbeat = heartbeatService(db)
        try {
          const wakeRun = await heartbeat.wakeup(approval.requestedByAgentId, {
            source: 'automation',
            triggerDetail: 'system',
            reason: 'approval_approved',
            payload: {
              approvalId: approval.id,
              approvalStatus: approval.status,
              issueId: primaryIssueId,
              issueIds: linkedIssueIds,
            },
            requestedByActorType: 'user',
            requestedByActorId: actor.userId ?? 'board',
            contextSnapshot: {
              source: 'approval.approved',
              approvalId: approval.id,
              approvalStatus: approval.status,
              issueId: primaryIssueId,
              issueIds: linkedIssueIds,
              taskId: primaryIssueId,
              wakeReason: 'approval_approved',
            },
          })

          await logActivity(db, {
            companyId: approval.companyId,
            actorType: 'user',
            actorId: actor.userId ?? 'board',
            action: 'approval.requester_wakeup_queued',
            entityType: 'approval',
            entityId: approval.id,
            details: {
              requesterAgentId: approval.requestedByAgentId,
              wakeRunId: wakeRun?.id ?? null,
              linkedIssueIds,
            },
          })
        } catch (err) {
          logger.warn(
            {
              err,
              approvalId: approval.id,
              requestedByAgentId: approval.requestedByAgentId,
            },
            'failed to queue requester wakeup after approval',
          )
          await logActivity(db, {
            companyId: approval.companyId,
            actorType: 'user',
            actorId: actor.userId ?? 'board',
            action: 'approval.requester_wakeup_failed',
            entityType: 'approval',
            entityId: approval.id,
            details: {
              requesterAgentId: approval.requestedByAgentId,
              linkedIssueIds,
              error: err instanceof Error ? err.message : String(err),
            },
          })
        }
      }
    }

    return NextResponse.json(redactApprovalPayload(approval))
  } catch (err) {
    return handleError(err)
  }
}
