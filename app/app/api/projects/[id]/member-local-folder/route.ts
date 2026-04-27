import { NextRequest, NextResponse } from 'next/server'
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
    if (actor.type !== 'board' || !actor.userId) {
      return NextResponse.json({ error: 'User authentication required' }, { status: 403 })
    }
    const folder = await svc.getMemberLocalFolder(id, 'user', actor.userId)
    return NextResponse.json(folder ?? { cwd: null })
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
    if (actor.type !== 'board' || !actor.userId) {
      return NextResponse.json({ error: 'User authentication required' }, { status: 403 })
    }
    let body: unknown
    try {
      body = await req.json()
    } catch {
      body = null
    }
    const cwd =
      body && typeof (body as Record<string, unknown>).cwd === 'string'
        ? ((body as Record<string, unknown>).cwd as string).trim()
        : null
    if (!cwd) {
      return NextResponse.json({ error: 'cwd is required' }, { status: 422 })
    }
    const folder = await svc.setMemberLocalFolder(id, existing.companyId, 'user', actor.userId, cwd)
    return NextResponse.json(folder)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
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
    if (actor.type !== 'board' || !actor.userId) {
      return NextResponse.json({ error: 'User authentication required' }, { status: 403 })
    }
    await svc.deleteMemberLocalFolder(id, 'user', actor.userId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return handleError(err)
  }
}
