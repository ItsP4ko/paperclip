import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, issueApprovalService, agentService, logActivity } from '@/services/index'
import { linkIssueApprovalSchema } from '@paperclipai/shared'

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

    const issueApprovalsSvc = issueApprovalService(db)
    const approvals = await issueApprovalsSvc.listApprovalsForIssue(id)
    return NextResponse.json(approvals)
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
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })

    const canManage = await assertCanManageIssueApprovalLinks(actor, issue.companyId)
    if (!canManage) {
      return NextResponse.json({ error: 'Missing permission to link approvals' }, { status: 403 })
    }

    const body = await parseBody(req, linkIssueApprovalSchema)
    const actorInfo = getActorInfo(actor)
    const issueApprovalsSvc = issueApprovalService(db)
    await issueApprovalsSvc.link(id, (body as Record<string, unknown>).approvalId as string, {
      agentId: actorInfo.agentId,
      userId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
    })

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.approval_linked',
      entityType: 'issue',
      entityId: issue.id,
      details: { approvalId: (body as Record<string, unknown>).approvalId },
    })

    const approvals = await issueApprovalsSvc.listApprovalsForIssue(id)
    return NextResponse.json(approvals, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
