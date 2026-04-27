import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, documentService } from '@/services/index'
import { issueDocumentKeySchema } from '@paperclipai/shared'

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
    const revisions = await documentsSvc.listIssueDocumentRevisions(issue.id, keyParsed.data)
    return NextResponse.json(revisions)
  } catch (err) {
    return handleError(err)
  }
}
