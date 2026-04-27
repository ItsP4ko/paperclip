import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, documentService, logActivity } from '@/services/index'
import { issueDocumentKeySchema, upsertIssueDocumentSchema } from '@paperclipai/shared'

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
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId, key: rawKey } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    const keyParsed = issueDocumentKeySchema.safeParse(String(rawKey ?? '').trim().toLowerCase())
    if (!keyParsed.success) {
      return NextResponse.json({ error: 'Invalid document key', details: keyParsed.error.issues }, { status: 400 })
    }

    const documentsSvc = documentService(db)
    const doc = await documentsSvc.getIssueDocumentByKey(issue.id, keyParsed.data)
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    return NextResponse.json(doc)
  } catch (err) {
    return handleError(err)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId, key: rawKey } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    const keyParsed = issueDocumentKeySchema.safeParse(String(rawKey ?? '').trim().toLowerCase())
    if (!keyParsed.success) {
      return NextResponse.json({ error: 'Invalid document key', details: keyParsed.error.issues }, { status: 400 })
    }

    const body = await parseBody(req, upsertIssueDocumentSchema)
    const actorInfo = getActorInfo(actor)
    const documentsSvc = documentService(db)
    const result = await documentsSvc.upsertIssueDocument({
      issueId: issue.id,
      key: keyParsed.data,
      title: (body as Record<string, unknown>).title as string ?? null,
      format: (body as Record<string, unknown>).format as string,
      body: (body as Record<string, unknown>).body as string,
      changeSummary: (body as Record<string, unknown>).changeSummary as string ?? null,
      baseRevisionId: (body as Record<string, unknown>).baseRevisionId as string ?? null,
      createdByAgentId: actorInfo.agentId ?? null,
      createdByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
      createdByRunId: actorInfo.runId ?? null,
    })
    const doc = result.document

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: result.created ? 'issue.document_created' : 'issue.document_updated',
      entityType: 'issue',
      entityId: issue.id,
      details: {
        key: doc.key,
        documentId: doc.id,
        title: doc.title,
        format: doc.format,
        revisionNumber: doc.latestRevisionNumber,
      },
    })

    return NextResponse.json(doc, { status: result.created ? 201 : 200 })
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId, key: rawKey } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    if (actor.type !== 'board') {
      return NextResponse.json({ error: 'Board authentication required' }, { status: 403 })
    }

    const keyParsed = issueDocumentKeySchema.safeParse(String(rawKey ?? '').trim().toLowerCase())
    if (!keyParsed.success) {
      return NextResponse.json({ error: 'Invalid document key', details: keyParsed.error.issues }, { status: 400 })
    }

    const documentsSvc = documentService(db)
    const removed = await documentsSvc.deleteIssueDocument(issue.id, keyParsed.data)
    if (!removed) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.document_deleted',
      entityType: 'issue',
      entityId: issue.id,
      details: { key: removed.key, documentId: removed.id, title: removed.title },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
