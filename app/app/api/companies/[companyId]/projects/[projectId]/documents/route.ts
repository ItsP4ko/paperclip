import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { assets, projectDocuments } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { createStorageService } from '@/lib/storage'

export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; projectId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { companyId, projectId } = await params
    assertCompanyAccess(actor, companyId)

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const storage = createStorageService()
    const arrayBuffer = await file.arrayBuffer()
    const body = Buffer.from(arrayBuffer)

    const stored = await storage.putFile({
      companyId,
      namespace: `projects/${projectId}/documents`,
      originalFilename: file.name || null,
      contentType: file.type,
      body,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [asset] = await (db.insert(assets) as any).values({
      companyId,
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256 ?? null,
      originalFilename: stored.originalFilename ?? null,
    }).returning()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [doc] = await (db.insert(projectDocuments) as any).values({
      projectId,
      companyId,
      assetId: asset.id,
    }).returning()

    return NextResponse.json(
      {
        id: doc.id,
        originalFilename: stored.originalFilename,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        createdAt: doc.createdAt,
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('[gemini] upload project doc error:', err)
    return handleError(err)
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; projectId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { companyId, projectId } = await params
    assertCompanyAccess(actor, companyId)

    const rows = await db
      .select({
        id: projectDocuments.id,
        assetId: assets.id,
        originalFilename: assets.originalFilename,
        contentType: assets.contentType,
        byteSize: assets.byteSize,
        createdAt: projectDocuments.createdAt,
      })
      .from(projectDocuments)
      .innerJoin(assets, eq(projectDocuments.assetId, assets.id))
      .where(eq(projectDocuments.projectId, projectId))

    return NextResponse.json(rows)
  } catch (err) {
    return handleError(err)
  }
}
