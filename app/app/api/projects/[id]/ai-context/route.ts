import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { projects as projectsTable } from '@paperclipai/db'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { projectService } from '@/services/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = projectService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)
    const [row] = await db
      .select({ aiContext: projectsTable.aiContext })
      .from(projectsTable)
      .where(eq(projectsTable.id, existing.id))
    return NextResponse.json({ content: row?.aiContext ?? '' })
  } catch (err) {
    return handleError(err)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = projectService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)

    let body: unknown
    try {
      body = await req.json()
    } catch {
      body = null
    }
    const content =
      body && typeof (body as Record<string, unknown>).content === 'string'
        ? (body as Record<string, unknown>).content as string
        : null
    if (content === null) {
      return NextResponse.json({ error: 'content is required' }, { status: 422 })
    }
    await db
      .update(projectsTable)
      .set({ aiContext: content, updatedAt: new Date() })
      .where(eq(projectsTable.id, existing.id))
    return NextResponse.json({ content })
  } catch (err) {
    return handleError(err)
  }
}
