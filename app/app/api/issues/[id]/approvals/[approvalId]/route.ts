import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, issueApprovalService, agentService, logActivity } from '@/services/index'

export const maxDuration = 30

async function normalizeIssueIdentifier(rawId: string): Promise<string> {
  const svc = issueService(db)
  if (/^[A-Z]+-\d+$/i.test(rawId)) {
    const issue = await svc.getByIdentifier(rawId)
    if (issue) return issue.id
  }
  return rawId
}

async function assertCanManageIssueApprovalLinks(
  actor: Awaited<ReturnType<typeof resolveActor>>,
  companyId: string,
): Promise<boolean> {
  assertCompanyAccess(actor, companyId)
  if (actor.type === 'board') return true
  if (actor.type === 'agent') {
    if (!actor.agentId) return false
    const agentsSvc = agentService(db)
    const actorAgent = await agentsSvc.getById(actor.agentId)
    if (!actorAgent || actorAgent.companyId !== companyId) return false
    if (actorAgent.role === 'ceo' || Boolean((actorAgent.permissions as Record<string, unknown> | null | undefined)?.canCreateAgents)) return true
    return false
  }
  return false
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; approvalId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId, approvalId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })

    const canManage = await assertCanManageIssueApprovalLinks(actor, issue.companyId)
    if (!canManage) {
      return NextResponse.json({ error: 'Missing permission to link approvals' }, { status: 403 })
    }

    const issueApprovalsSvc = issueApprovalService(db)
    await issueApprovalsSvc.unlink(id, approvalId)

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.approval_unlinked',
      entityType: 'issue',
      entityId: issue.id,
      details: { approvalId },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
