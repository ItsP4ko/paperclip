import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, logActivity } from '@/services/index'
import { createStorageService } from '@/lib/storage'

export const maxDuration = 30

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { attachmentId } = await params

    const svc = issueService(db)
    const attachment = await svc.getAttachmentById(attachmentId)
    if (!attachment) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    assertCompanyAccess(actor, attachment.companyId)

    const storage = createStorageService()
    try {
      await storage.deleteObject(attachment.companyId, attachment.objectKey)
    } catch (err) {
      console.warn({ err, attachmentId }, 'storage delete failed while removing attachment')
    }

    const removed = await svc.removeAttachment(attachmentId)
    if (!removed) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: removed.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.attachment_removed',
      entityType: 'issue',
      entityId: removed.issueId,
      details: { attachmentId: removed.id },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
