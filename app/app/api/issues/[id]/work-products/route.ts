import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, workProductService, logActivity } from '@/services/index'
import { createIssueWorkProductSchema } from '@paperclipai/shared'

export const maxDuration = 30

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

    const workProductsSvc = workProductService(db)
    const workProducts = await workProductsSvc.listForIssue(issue.id)
    return NextResponse.json(workProducts)
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
    assertCompanyAccess(actor, issue.companyId)

    const body = await parseBody(req, createIssueWorkProductSchema)
    const workProductsSvc = workProductService(db)
    const dataWithProject = {
      ...body,
      status: body.status ?? 'active',
      projectId: (body.projectId !== undefined ? body.projectId : issue.projectId) ?? null,
    }
    const product = await workProductsSvc.createForIssue(issue.id, issue.companyId, dataWithProject)
    if (!product) {
      return NextResponse.json({ error: 'Invalid work product payload' }, { status: 422 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.work_product_created',
      entityType: 'issue',
      entityId: issue.id,
      details: { workProductId: product.id, type: product.type, provider: product.provider },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
