import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { assertCompanyPermission } from '@/server/access-helpers'
import { accessService } from '@/services/index'

export const maxDuration = 30

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; principalId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, principalId } = await params
    await assertCompanyPermission(db, actor, companyId, 'users:manage_permissions')

    if (actor.type === 'board' && actor.userId === principalId) {
      return NextResponse.json(
        { error: 'Cannot remove yourself from the company' },
        { status: 400 },
      )
    }

    const access = accessService(db)
    const removed = await access.removeMember(companyId, principalId)
    if (!removed) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }
    return NextResponse.json({ removed: true })
  } catch (err) {
    return handleError(err)
  }
}
