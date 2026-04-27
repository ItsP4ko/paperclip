import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { approvalService, logActivity } from '@/services/index'
import { addApprovalCommentSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = approvalService(db)
    const approval = await svc.getById(id)
    if (!approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, approval.companyId)
    const comments = await svc.listComments(id)
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
    const { id } = await params
    const svc = approvalService(db)
    const approval = await svc.getById(id)
    if (!approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, approval.companyId)
    const actorInfo = getActorInfo(actor)
    const body = await parseBody(req, addApprovalCommentSchema) as { body: string }
    const comment = await svc.addComment(id, body.body, {
      agentId: actorInfo.agentId ?? undefined,
      userId: actorInfo.actorType === 'user' ? actorInfo.actorId : undefined,
    })

    await logActivity(db, {
      companyId: approval.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'approval.comment_added',
      entityType: 'approval',
      entityId: approval.id,
      details: { commentId: comment.id },
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
