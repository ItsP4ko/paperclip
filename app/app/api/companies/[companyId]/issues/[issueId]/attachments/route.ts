import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, logActivity } from '@/services/index'
import { createStorageService } from '@/lib/storage'
import { createIssueAttachmentMetadataSchema } from '@paperclipai/shared'

export const maxDuration = 60

const MAX_ATTACHMENT_BYTES = Number(process.env.PAPERCLIP_ATTACHMENT_MAX_BYTES) || 10 * 1024 * 1024

const ALLOWED_ATTACHMENT_PATTERNS: string[] = (() => {
  const raw = process.env.PAPERCLIP_ALLOWED_ATTACHMENT_TYPES
  if (!raw) return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf', 'text/markdown', 'text/plain', 'application/json', 'text/csv', 'text/html']
  const parsed = raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)
  return parsed.length > 0 ? parsed : ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
})()

function isAllowedContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase()
  return ALLOWED_ATTACHMENT_PATTERNS.some((pattern) => {
    if (pattern === '*') return true
    if (pattern.endsWith('/*') || pattern.endsWith('.*')) return ct.startsWith(pattern.slice(0, -1))
    return ct === pattern
  })
}

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; issueId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, issueId: rawIssueId } = await params
    assertCompanyAccess(actor, companyId)

    const issueId = await normalizeIssueIdentifier(rawIssueId)
    const svc = issueService(db)
    const issue = await svc.getById(issueId)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    if (issue.companyId !== companyId) {
      return NextResponse.json({ error: 'Issue does not belong to company' }, { status: 422 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: "Missing file field 'file'" }, { status: 400 })

    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: `Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes` }, { status: 422 })
    }

    const contentType = (file.type || '').toLowerCase()
    if (!isAllowedContentType(contentType)) {
      return NextResponse.json({ error: `Unsupported attachment type: ${contentType || 'unknown'}` }, { status: 422 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length <= 0) {
      return NextResponse.json({ error: 'Attachment is empty' }, { status: 422 })
    }

    // Parse metadata from form fields
    const metaRaw: Record<string, unknown> = {}
    for (const [key, value] of formData.entries()) {
      if (key !== 'file') metaRaw[key] = value
    }
    const parsedMeta = createIssueAttachmentMetadataSchema.safeParse(metaRaw)
    if (!parsedMeta.success) {
      return NextResponse.json({ error: 'Invalid attachment metadata', details: parsedMeta.error.issues }, { status: 400 })
    }

    const storage = createStorageService()
    const actorInfo = getActorInfo(actor)
    const stored = await storage.putFile({
      companyId,
      namespace: `issues/${issueId}`,
      originalFilename: file.name || null,
      contentType,
      body: buffer,
    })

    const attachment = await svc.createAttachment({
      issueId,
      issueCommentId: parsedMeta.data.issueCommentId ?? null,
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: actorInfo.agentId,
      createdByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
    })

    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.attachment_added',
      entityType: 'issue',
      entityId: issueId,
      details: {
        attachmentId: attachment.id,
        originalFilename: attachment.originalFilename,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
      },
    })

    return NextResponse.json(withContentPath(attachment), { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
