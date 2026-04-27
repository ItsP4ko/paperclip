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

    let body: { role?: string } = {}
    try { body = await req.json() } catch { /* ignore */ }
    const { role } = body

    if (!['owner', 'developer', 'member'].includes(role ?? '')) {
      return NextResponse.json(
        { error: "Invalid role. Use 'owner', 'developer', or 'member'." },
        { status: 400 },
      )
    }

    await assertCompanyPermission(db, actor, companyId, 'users:manage_permissions')

    if (actor.type === 'board' && actor.userId === principalId) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
    }

    const access = accessService(db)
    const updated = await access.updateMemberRole(companyId, principalId, role!)
    if (!updated) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }
    return NextResponse.json(updated)
  } catch (err) {
    return handleError(err)
  }
}
