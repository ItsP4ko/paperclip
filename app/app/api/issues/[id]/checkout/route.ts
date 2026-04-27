import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, heartbeatService, projectService, logActivity } from '@/services/index'
import { checkoutIssueSchema } from '@paperclipai/shared'
import { shouldWakeAssigneeOnCheckout } from '@/server/issues-checkout-wakeup'

export const maxDuration = 30

async function normalizeIssueIdentifier(rawId: string): Promise<string> {
  const svc = issueService(db)
  if (/^[A-Z]+-\d+$/i.test(rawId)) {
    const issue = await svc.getByIdentifier(rawId)
    if (issue) return issue.id
  }
  return rawId
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

    const body = await parseBody(req, checkoutIssueSchema)

    if (issue.projectId) {
      const projectsSvc = projectService(db)
      const project = await projectsSvc.getById(issue.projectId)
      if (project?.pausedAt) {
        return NextResponse.json({
          error: project.pauseReason === 'budget'
            ? 'Project is paused because its budget hard-stop was reached'
            : 'Project is paused',
        }, { status: 409 })
      }
    }

    if (actor.type === 'agent' && actor.agentId !== (body as Record<string, unknown>).agentId) {
      return NextResponse.json({ error: 'Agent can only checkout as itself' }, { status: 403 })
    }

    const checkoutRunId = actor.type === 'agent' ? actor.runId?.trim() ?? null : null
    if (actor.type === 'agent' && !checkoutRunId) {
      return NextResponse.json({ error: 'Agent run id required' }, { status: 401 })
    }

    const updated = await svc.checkout(
      id,
      (body as Record<string, unknown>).agentId as string,
      ((body as Record<string, unknown>).expectedStatuses as string[] | undefined) ?? [],
      checkoutRunId,
    )

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.checked_out',
      entityType: 'issue',
      entityId: issue.id,
      details: { agentId: (body as Record<string, unknown>).agentId },
    })

    if (shouldWakeAssigneeOnCheckout({
      actorType: actor.type,
      actorAgentId: actor.type === 'agent' ? actor.agentId ?? null : null,
      checkoutAgentId: (body as Record<string, unknown>).agentId as string,
      checkoutRunId,
    })) {
      void heartbeat.wakeup((body as Record<string, unknown>).agentId as string, {
        source: 'assignment',
        triggerDetail: 'system',
        reason: 'issue_checked_out',
        payload: { issueId: issue.id, mutation: 'checkout' },
        requestedByActorType: actorInfo.actorType,
        requestedByActorId: actorInfo.actorId,
        contextSnapshot: { issueId: issue.id, source: 'issue.checkout' },
      }).catch((err: unknown) => console.warn({ err, issueId: issue.id }, 'failed to wake assignee on issue checkout'))
    }

    return NextResponse.json(updated)
  } catch (err) {
    return handleError(err)
  }
}
