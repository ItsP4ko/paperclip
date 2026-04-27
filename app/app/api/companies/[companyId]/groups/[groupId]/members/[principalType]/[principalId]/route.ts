import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden, notFound, badRequest } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { groupService } from '@/services/groups'
import { accessService } from '@/services/access'
import { updateGroupMemberRoleSchema } from '@paperclipai/shared'
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; groupId: string; principalType: string; principalId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, groupId, principalType, principalId } = await params
    assertCompanyAccess(actor, companyId)
    await assertOwnerOrGroupAdmin(actor, companyId, groupId)
    const svc = groupService(db)
    const group = await svc.getById(groupId)
    if (!group || group.companyId !== companyId) throw notFound('Group not found')

    // Last-admin protection
    const existing = await svc.getMembership(groupId, principalType, principalId)
    if (existing?.role === 'admin') {
      const adminCount = await svc.countAdmins(groupId)
      if (adminCount <= 1) {
        const userId = getUserId(actor)
        const access = accessService(db)
        const cm = await access.getMembership(companyId, 'user', userId)
        if (cm?.membershipRole !== 'owner') {
          throw badRequest('Cannot remove the last group admin. A company owner must perform this action.')
        }
      }
    }

    const deleted = await svc.removeMember(groupId, principalType, principalId)
    if (!deleted) throw notFound('Member not found in group')
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; groupId: string; principalType: string; principalId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, groupId, principalType, principalId } = await params
    assertCompanyAccess(actor, companyId)
    await assertOwner(actor, companyId)
    const svc = groupService(db)
    const group = await svc.getById(groupId)
    if (!group || group.companyId !== companyId) throw notFound('Group not found')
    const body = await parseBody(req, updateGroupMemberRoleSchema) as { role: 'member' | 'admin' }
    const updated = await svc.updateMemberRole(groupId, principalType, principalId, body.role)
    if (!updated) throw notFound('Member not found in group')
    return NextResponse.json(updated)
  } catch (err) {
    return handleError(err)
  }
}
