import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService } from '@/services/index'

export const maxDuration = 30

function withContentPath<T extends { id: string }>(attachment: T) {
  return { ...attachment, contentPath: `/api/attachments/${attachment.id}/content` }
}

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
    const issueId = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const issue = await svc.getById(issueId)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    const attachments = await svc.listAttachments(issueId)
    return NextResponse.json(attachments.map(withContentPath))
  } catch (err) {
    return handleError(err)
  }
}
