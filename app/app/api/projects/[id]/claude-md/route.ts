import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { projects as projectsTable } from '@paperclipai/db'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { forbidden } from '@/server/errors'
import { db } from '@/lib/db'
import { projectService } from '@/services/index'
import { and } from 'drizzle-orm'
import { companyMemberships } from '@paperclipai/db'
import type { Actor } from '@/server/actor'

export const maxDuration = 30

async function assertOwnerAccess(actor: Actor, companyId: string) {
  if (actor.type !== 'board') return
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  if (!actor.userId) throw forbidden('Authentication required')
  const [membership] = await db
    .select({ membershipRole: companyMemberships.membershipRole })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.principalType, 'user'),
        eq(companyMemberships.principalId, actor.userId),
      ),
    )
  if (!membership || membership.membershipRole !== 'owner') {
    throw forbidden('Owner role required')
  }
}

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
      .select({ claudeMd: projectsTable.claudeMd })
      .from(projectsTable)
      .where(eq(projectsTable.id, existing.id))
    return NextResponse.json({ content: row?.claudeMd ?? '' })
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
    await assertOwnerAccess(actor, existing.companyId)

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
      .set({ claudeMd: content, updatedAt: new Date() })
      .where(eq(projectsTable.id, existing.id))
    return NextResponse.json({ content })
  } catch (err) {
    return handleError(err)
  }
}
