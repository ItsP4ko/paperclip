import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { approvalService, logActivity, secretService } from '@/services/index'
import { resubmitApprovalSchema } from '@paperclipai/shared'
import { redactEventPayload } from '@/redaction'

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
    const { id } = await params
    const svc = approvalService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)

    if (actor.type === 'agent' && actor.agentId !== existing.requestedByAgentId) {
      return NextResponse.json(
        { error: 'Only requesting agent can resubmit this approval' },
        { status: 403 },
      )
    }

    const body = await parseBody(req, resubmitApprovalSchema) as { payload?: Record<string, unknown> }
    const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === 'true'
    const secretsSvc = secretService(db)

    const normalizedPayload = body.payload
      ? existing.type === 'hire_agent'
        ? await secretsSvc.normalizeHireApprovalPayloadForPersistence(
            existing.companyId,
            body.payload,
            { strictMode: strictSecretsMode },
          )
        : body.payload
      : undefined

    const approval = await svc.resubmit(id, normalizedPayload)
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: approval.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'approval.resubmitted',
      entityType: 'approval',
      entityId: approval.id,
      details: { type: approval.type },
    })
    return NextResponse.json(redactApprovalPayload(approval))
  } catch (err) {
    return handleError(err)
  }
}
