import { NextRequest, NextResponse } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import { issues, issueAttachments, assets } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; projectId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { companyId, projectId } = await params
    assertCompanyAccess(actor, companyId)

    const projectIssues = await db
      .select({
        id: issues.id,
        title: issues.title,
        identifier: issues.identifier,
        status: issues.status,
      })
      .from(issues)
      .where(eq(issues.projectId, projectId))

    if (projectIssues.length === 0) {
      return NextResponse.json({ folders: [] })
    }

    const issueIds = projectIssues.map((i) => i.id)

    const attachmentRows = await db
      .select({
        attachmentId: issueAttachments.id,
        issueId: issueAttachments.issueId,
        assetId: assets.id,
        originalFilename: assets.originalFilename,
        contentType: assets.contentType,
        byteSize: assets.byteSize,
        createdAt: issueAttachments.createdAt,
      })
      .from(issueAttachments)
      .innerJoin(assets, eq(issueAttachments.assetId, assets.id))
      .where(inArray(issueAttachments.issueId, issueIds))

    const byIssueId = new Map<string, typeof attachmentRows>()
    for (const row of attachmentRows) {
      const existing = byIssueId.get(row.issueId) ?? []
      existing.push(row)
      byIssueId.set(row.issueId, existing)
    }

    const folders = projectIssues
      .filter((issue) => byIssueId.has(issue.id))
      .map((issue) => ({
        issueId: issue.id,
        issueTitle: issue.title,
        issueIdentifier: issue.identifier,
        issueStatus: issue.status,
        attachments: (byIssueId.get(issue.id) ?? []).map((a) => ({
          id: a.attachmentId,
          originalFilename: a.originalFilename,
          contentType: a.contentType,
          byteSize: a.byteSize,
          contentPath: `/api/attachments/${a.attachmentId}/content`,
          createdAt: a.createdAt,
        })),
      }))

    return NextResponse.json({ folders })
  } catch (err) {
    return handleError(err)
  }
}
