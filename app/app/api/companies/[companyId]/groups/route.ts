import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden, conflict } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { groupService } from '@/services/groups'
import { accessService } from '@/services/access'
import { createGroupSchema } from '@paperclipai/shared'
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
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    await assertCompanyMember(actor, companyId)
    const svc = groupService(db)
    const result = await svc.list(companyId)
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
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
    await assertOwner(actor, companyId)
    const userId = getUserId(actor)
    const body = await parseBody(req, createGroupSchema) as { name: string; description?: string }
    const svc = groupService(db)
    try {
      const group = await svc.create(companyId, body.name, body.description ?? null, userId)
      return NextResponse.json(group, { status: 201 })
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
