import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService } from '@/services/index'
import { createStorageService } from '@/lib/storage'

export const maxDuration = 30

export async function GET(
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
    const object = await storage.getObject(attachment.companyId, attachment.objectKey)

    const chunks: Buffer[] = []
    for await (const chunk of object.stream) {
      chunks.push(Buffer.from(chunk as Uint8Array))
    }
    const body = Buffer.concat(chunks)

    const contentType = attachment.contentType || object.contentType || 'application/octet-stream'
    const filename = attachment.originalFilename ?? 'attachment'
    const safeFilename = filename.replaceAll('"', '')

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.length),
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `inline; filename="${safeFilename}"`,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
