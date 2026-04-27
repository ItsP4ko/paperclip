import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { assertCompanyPermission } from '@/server/access-helpers'
import { accessService } from '@/services/index'

export const maxDuration = 30

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; principalId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, principalId } = await params

    let body: { status?: string } = {}
    try { body = await req.json() } catch { /* ignore */ }
    const { status } = body

    if (!['active', 'suspended'].includes(status ?? '')) {
      return NextResponse.json(
        { error: "Invalid status. Use 'active' or 'suspended'." },
        { status: 400 },
      )
    }

    await assertCompanyPermission(db, actor, companyId, 'users:manage_permissions')

    if (actor.type === 'board' && actor.userId === principalId) {
      return NextResponse.json({ error: 'Cannot change your own status' }, { status: 400 })
    }

    const access = accessService(db)
    const updated = await access.updateMemberStatus(companyId, principalId, status!)
    if (!updated) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }
    return NextResponse.json(updated)
  } catch (err) {
    return handleError(err)
  }
}
