import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { assetService } from '@/services/index'
import { createStorageService } from '@/lib/storage'

export const maxDuration = 30

const SVG_CONTENT_TYPE = 'image/svg+xml'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { assetId } = await params

    const svc = assetService(db)
    const asset = await svc.getById(assetId)
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    assertCompanyAccess(actor, asset.companyId)

    const storage = createStorageService()
    const object = await storage.getObject(asset.companyId, asset.objectKey)

    const chunks: Buffer[] = []
    for await (const chunk of object.stream) {
      chunks.push(Buffer.from(chunk as Uint8Array))
    }
    const body = Buffer.concat(chunks)

    const responseContentType = asset.contentType || object.contentType || 'application/octet-stream'
    const filename = asset.originalFilename ?? 'asset'
    const safeFilename = filename.replaceAll('"', '')

    const headers: Record<string, string> = {
      'Content-Type': responseContentType,
      'Content-Length': String(body.length),
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${safeFilename}"`,
    }

    if (responseContentType === SVG_CONTENT_TYPE) {
      headers['Content-Security-Policy'] = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
    }

    return new NextResponse(body, { headers })
  } catch (err) {
    return handleError(err)
  }
}
