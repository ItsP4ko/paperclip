import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { agents as agentsTable } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService } from '@/services/index'
import { assertOwnerAccess } from '../../../_shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = agentService(db)
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)
    const [row] = await db
      .select({ agentMd: agentsTable.agentMd })
      .from(agentsTable)
      .where(eq(agentsTable.id, existing.id))
    return NextResponse.json({ content: row?.agentMd ?? '' })
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
    const svc = agentService(db)
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)
    await assertOwnerAccess(actor, existing.companyId)

    let body: unknown
    try {
      body = await req.json()
    } catch {
      body = null
    }
    const content = typeof (body as Record<string, unknown>)?.content === 'string'
      ? (body as Record<string, unknown>).content as string
      : null
    if (content === null) {
      return NextResponse.json({ error: 'content is required' }, { status: 422 })
    }

    await db
      .update(agentsTable)
      .set({ agentMd: content, updatedAt: new Date() })
      .where(eq(agentsTable.id, existing.id))

    return NextResponse.json({ content })
  } catch (err) {
    return handleError(err)
  }
}
