import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, documentService, logActivity } from '@/services/index'
import { issueDocumentKeySchema, restoreIssueDocumentRevisionSchema } from '@paperclipai/shared'

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
  { params }: { params: Promise<{ id: string; key: string; revisionId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId, key: rawKey, revisionId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    const keyParsed = issueDocumentKeySchema.safeParse(String(rawKey ?? '').trim().toLowerCase())
    if (!keyParsed.success) {
      return NextResponse.json({ error: 'Invalid document key', details: keyParsed.error.issues }, { status: 400 })
    }

    await parseBody(req, restoreIssueDocumentRevisionSchema)
    const actorInfo = getActorInfo(actor)
    const documentsSvc = documentService(db)
    const result = await documentsSvc.restoreIssueDocumentRevision({
      issueId: issue.id,
      key: keyParsed.data,
      revisionId,
      createdByAgentId: actorInfo.agentId ?? null,
      createdByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
    })

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.document_restored',
      entityType: 'issue',
      entityId: issue.id,
      details: {
        key: result.document.key,
        documentId: result.document.id,
        title: result.document.title,
        format: result.document.format,
        revisionNumber: result.document.latestRevisionNumber,
        restoredFromRevisionId: result.restoredFromRevisionId,
        restoredFromRevisionNumber: result.restoredFromRevisionNumber,
      },
    })

    return NextResponse.json(result.document)
  } catch (err) {
    return handleError(err)
  }
}
