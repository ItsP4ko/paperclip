import { NextRequest, NextResponse } from 'next/server'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { assetService, logActivity } from '@/services/index'
import { createStorageService } from '@/lib/storage'
import { createAssetImageMetadataSchema } from '@paperclipai/shared'

export const maxDuration = 60

const MAX_ATTACHMENT_BYTES = Number(process.env.PAPERCLIP_ATTACHMENT_MAX_BYTES) || 10 * 1024 * 1024
const SVG_CONTENT_TYPE = 'image/svg+xml'

const DEFAULT_ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'application/pdf', 'text/markdown', 'text/plain', 'application/json', 'text/csv', 'text/html',
]

function isAllowedContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase()
  const patterns = (() => {
    const raw = process.env.PAPERCLIP_ALLOWED_ATTACHMENT_TYPES
    if (!raw) return DEFAULT_ALLOWED_TYPES
    const parsed = raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)
    return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_TYPES
  })()
  return patterns.some((p) => {
    if (p === '*') return true
    if (p.endsWith('/*') || p.endsWith('.*')) return ct.startsWith(p.slice(0, -1))
    return ct === p
  })
}

function sanitizeSvgBuffer(input: Buffer): Buffer | null {
  const raw = input.toString('utf8').trim()
  if (!raw) return null
  const baseDom = new JSDOM('')
  const domPurify = createDOMPurify(baseDom.window as unknown as Parameters<typeof createDOMPurify>[0])
  domPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    const attrName = data.attrName.toLowerCase()
    const attrValue = (data.attrValue ?? '').trim()
    if (attrName.startsWith('on')) { data.keepAttr = false; return }
    if ((attrName === 'href' || attrName === 'xlink:href') && attrValue && !attrValue.startsWith('#')) {
      data.keepAttr = false
    }
  })
  let parsedDom: JSDOM | null = null
  try {
    const sanitized = domPurify.sanitize(raw, {
      USE_PROFILES: { svg: true, svgFilters: true, html: false },
      FORBID_TAGS: ['script', 'foreignObject'],
      FORBID_CONTENTS: ['script', 'foreignObject'],
      RETURN_TRUSTED_TYPE: false,
    })
    parsedDom = new JSDOM(sanitized, { contentType: SVG_CONTENT_TYPE })
    const document = parsedDom.window.document
    const root = document.documentElement
    if (!root || root.tagName.toLowerCase() !== 'svg') return null
    for (const el of Array.from(root.querySelectorAll('script, foreignObject'))) el.remove()
    for (const el of Array.from(root.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        const attrName = attr.name.toLowerCase()
        const attrValue = attr.value.trim()
        if (attrName.startsWith('on')) { el.removeAttribute(attr.name); continue }
        if ((attrName === 'href' || attrName === 'xlink:href') && attrValue && !attrValue.startsWith('#')) {
          el.removeAttribute(attr.name)
        }
      }
    }
    const output = root.outerHTML.trim()
    if (!output || !/^<svg[\s>]/i.test(output)) return null
    return Buffer.from(output, 'utf8')
  } catch {
    return null
  } finally {
    parsedDom?.window.close()
    baseDom.window.close()
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: "Missing file field 'file'" }, { status: 400 })

    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: `File exceeds ${MAX_ATTACHMENT_BYTES} bytes` }, { status: 422 })
    }

    // Parse metadata
    const metaRaw: Record<string, unknown> = {}
    for (const [key, value] of formData.entries()) {
      if (key !== 'file') metaRaw[key] = value
    }
    const parsedMeta = createAssetImageMetadataSchema.safeParse(metaRaw)
    if (!parsedMeta.success) {
      return NextResponse.json({ error: 'Invalid image metadata', details: parsedMeta.error.issues }, { status: 400 })
    }

    const namespaceSuffix = parsedMeta.data.namespace ?? 'general'
    const contentType = (file.type || '').toLowerCase()
    if (contentType !== SVG_CONTENT_TYPE && !isAllowedContentType(contentType)) {
      return NextResponse.json({ error: `Unsupported file type: ${contentType || 'unknown'}` }, { status: 422 })
    }

    let buffer: Buffer = Buffer.from(await file.arrayBuffer())
    if (contentType === SVG_CONTENT_TYPE) {
      const sanitized = sanitizeSvgBuffer(buffer)
      if (!sanitized || sanitized.length <= 0) {
        return NextResponse.json({ error: 'SVG could not be sanitized' }, { status: 422 })
      }
      buffer = sanitized
    }
    if (buffer.length <= 0) return NextResponse.json({ error: 'Image is empty' }, { status: 422 })

    const storage = createStorageService()
    const actorInfo = getActorInfo(actor)
    const stored = await storage.putFile({
      companyId,
      namespace: `assets/${namespaceSuffix}`,
      originalFilename: file.name || null,
      contentType,
      body: buffer,
    })

    const svc = assetService(db)
    const asset = await svc.create(companyId, {
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
      action: 'asset.created',
      entityType: 'asset',
      entityId: asset.id,
      details: { originalFilename: asset.originalFilename, contentType: asset.contentType, byteSize: asset.byteSize },
    })

    return NextResponse.json({
      assetId: asset.id,
      companyId: asset.companyId,
      provider: asset.provider,
      objectKey: asset.objectKey,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
      sha256: asset.sha256,
      originalFilename: asset.originalFilename,
      createdByAgentId: asset.createdByAgentId,
      createdByUserId: asset.createdByUserId,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      contentPath: `/api/assets/${asset.id}/content`,
    }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
