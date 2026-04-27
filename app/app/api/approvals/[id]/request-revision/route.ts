import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { approvalService, logActivity } from '@/services/index'
import { requestApprovalRevisionSchema } from '@paperclipai/shared'
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
    assertBoard(actor)
    const { id } = await params
    const body = await parseBody(req, requestApprovalRevisionSchema) as {
      decidedByUserId?: string
      decisionNote?: string
    }
    const svc = approvalService(db)
    const approval = await svc.requestRevision(
      id,
      body.decidedByUserId ?? 'board',
      body.decisionNote,
    )

    await logActivity(db, {
      companyId: approval.companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'approval.revision_requested',
      entityType: 'approval',
      entityId: approval.id,
      details: { type: approval.type },
    })

    return NextResponse.json(redactApprovalPayload(approval))
  } catch (err) {
    return handleError(err)
  }
}
