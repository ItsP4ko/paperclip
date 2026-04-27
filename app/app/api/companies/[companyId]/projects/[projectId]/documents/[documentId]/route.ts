import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { assets, projectDocuments } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { createStorageService } from '@/lib/storage'

export const maxDuration = 30

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; projectId: string; documentId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { companyId, documentId } = await params
    assertCompanyAccess(actor, companyId)

    const [doc] = await db
      .select({
        id: projectDocuments.id,
        assetId: projectDocuments.assetId,
        objectKey: assets.objectKey,
      })
      .from(projectDocuments)
      .innerJoin(assets, eq(projectDocuments.assetId, assets.id))
      .where(eq(projectDocuments.id, documentId))
      .limit(1)

    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    try {
      const storage = createStorageService()
      await storage.deleteObject(companyId, doc.objectKey)
    } catch {
      // ignore storage errors, still remove from DB
    }

    await db.delete(projectDocuments).where(eq(projectDocuments.id, documentId))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return handleError(err)
  }
}
