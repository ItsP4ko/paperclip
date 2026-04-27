import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden, notFound, conflict } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { groupService } from '@/services/groups'
import { accessService } from '@/services/access'
import { updateGroupSchema } from '@paperclipai/shared'
import type { Actor } from '@/server/actor'

export const maxDuration = 30

function getUserId(actor: Actor): string {
  if (actor.type === 'board' && actor.userId) return actor.userId
  throw forbidden('User authentication required')
}

async function assertOwner(actor: Actor, companyId: string) {
  if (actor.type === 'board' && (actor.source === 'local_implicit' || actor.isInstanceAdmin)) return
  const userId = getUserId(actor)
  const access = accessService(db)
  const membership = await access.getMembership(companyId, 'user', userId)
  if (!membership || membership.status !== 'active' || membership.membershipRole !== 'owner') {
    throw forbidden('Owner role required')
  }
}

async function assertOwnerOrGroupAdmin(actor: Actor, companyId: string, groupId: string) {
  if (actor.type === 'board' && (actor.source === 'local_implicit' || actor.isInstanceAdmin)) return
  const userId = getUserId(actor)
  const access = accessService(db)
  const membership = await access.getMembership(companyId, 'user', userId)
  if (!membership || membership.status !== 'active') throw forbidden('Active company membership required')
  if (membership.membershipRole === 'owner') return
  const svc = groupService(db)
  const groupMember = await svc.getMembership(groupId, 'user', userId)
  if (!groupMember || groupMember.role !== 'admin') {
    throw forbidden('Owner or group admin role required')
  }
}

async function assertCompanyMember(actor: Actor, companyId: string) {
  if (actor.type === 'board' && (actor.source === 'local_implicit' || actor.isInstanceAdmin)) return
  const userId = getUserId(actor)
  const access = accessService(db)
  const membership = await access.getMembership(companyId, 'user', userId)
  if (!membership || membership.status !== 'active') {
    throw forbidden('Active company membership required')
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; groupId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, groupId } = await params
    assertCompanyAccess(actor, companyId)
    await assertCompanyMember(actor, companyId)
    const svc = groupService(db)
    const detail = await svc.getDetail(groupId)
    if (!detail || detail.companyId !== companyId) throw notFound('Group not found')
    return NextResponse.json(detail)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; groupId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, groupId } = await params
    assertCompanyAccess(actor, companyId)
    await assertOwnerOrGroupAdmin(actor, companyId, groupId)
    const svc = groupService(db)
    const group = await svc.getById(groupId)
    if (!group || group.companyId !== companyId) throw notFound('Group not found')
    const body = await parseBody(req, updateGroupSchema)
    try {
      const updated = await svc.update(groupId, body)
      return NextResponse.json(updated)
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('unique')) {
        throw conflict('A group with this name already exists in this company')
      }
      throw err
    }
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; groupId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, groupId } = await params
    assertCompanyAccess(actor, companyId)
    await assertOwner(actor, companyId)
    const svc = groupService(db)
    const group = await svc.getById(groupId)
    if (!group || group.companyId !== companyId) throw notFound('Group not found')
    await svc.remove(groupId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return handleError(err)
  }
}
