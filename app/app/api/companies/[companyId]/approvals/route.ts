import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { approvalService, issueApprovalService, logActivity, secretService } from '@/services/index'
import { createApprovalSchema } from '@paperclipai/shared'
import { redactEventPayload } from '@/redaction'

function redactApprovalPayload<T extends { payload: Record<string, unknown> }>(approval: T): T {
  return {
    ...approval,
    payload: redactEventPayload(approval.payload) ?? {},
  }
}

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = approvalService(db)
    const status = req.nextUrl.searchParams.get('status') ?? undefined
    const result = await svc.list(companyId, status)
    return NextResponse.json(result.map((approval) => redactApprovalPayload(approval)))
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === 'true'
    const body = await parseBody(req, createApprovalSchema) as Record<string, unknown>

    const rawIssueIds = body.issueIds
    const issueIds = Array.isArray(rawIssueIds)
      ? rawIssueIds.filter((value: unknown): value is string => typeof value === 'string')
      : []
    const uniqueIssueIds = Array.from(new Set(issueIds))
    const { issueIds: _issueIds, ...approvalInput } = body

    const secretsSvc = secretService(db)
    const normalizedPayload =
      approvalInput.type === 'hire_agent'
        ? await secretsSvc.normalizeHireApprovalPayloadForPersistence(
            companyId,
            approvalInput.payload as Record<string, unknown>,
            { strictMode: strictSecretsMode },
          )
        : (approvalInput.payload as Record<string, unknown>)

    const actorInfo = getActorInfo(actor)
    const svc = approvalService(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const approval = await svc.create(companyId, {
      ...approvalInput,
      payload: normalizedPayload,
      requestedByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
      requestedByAgentId:
        (approvalInput.requestedByAgentId as string | null | undefined) ??
        (actorInfo.actorType === 'agent' ? actorInfo.actorId : null),
      status: 'pending' as const,
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    } as any)

    if (uniqueIssueIds.length > 0) {
      const issueApprovalsSvc = issueApprovalService(db)
      await issueApprovalsSvc.linkManyForApproval(approval.id, uniqueIssueIds, {
        agentId: actorInfo.agentId,
        userId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
      })
    }

    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'approval.created',
      entityType: 'approval',
      entityId: approval.id,
      details: { type: approval.type, issueIds: uniqueIssueIds },
    })

    return NextResponse.json(redactApprovalPayload(approval), { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
