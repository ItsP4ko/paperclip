import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { workProductService, logActivity } from '@/services/index'
import { updateIssueWorkProductSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params

    const workProductsSvc = workProductService(db)
    const existing = await workProductsSvc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Work product not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)

    const body = await parseBody(req, updateIssueWorkProductSchema)
    const product = await workProductsSvc.update(id, body)
    if (!product) return NextResponse.json({ error: 'Work product not found' }, { status: 404 })

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.work_product_updated',
      entityType: 'issue',
      entityId: existing.issueId,
      details: { workProductId: product.id, changedKeys: Object.keys(body).sort() },
    })

    return NextResponse.json(product)
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
    const { id } = await params

    const workProductsSvc = workProductService(db)
    const existing = await workProductsSvc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Work product not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)

    const removed = await workProductsSvc.remove(id)
    if (!removed) return NextResponse.json({ error: 'Work product not found' }, { status: 404 })

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.work_product_deleted',
      entityType: 'issue',
      entityId: existing.issueId,
      details: { workProductId: removed.id, type: removed.type },
    })

    return NextResponse.json(removed)
  } catch (err) {
    return handleError(err)
  }
}
