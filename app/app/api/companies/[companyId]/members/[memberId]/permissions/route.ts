import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, notFound } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { assertCompanyPermission } from '@/server/access-helpers'
import { accessService } from '@/services/index'
import { updateMemberPermissionsSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; memberId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, memberId } = await params
    await assertCompanyPermission(db, actor, companyId, 'users:manage_permissions')

    const body = await parseBody(req, updateMemberPermissionsSchema)
    const access = accessService(db)
    const updated = await access.setMemberPermissions(
      companyId,
      memberId,
      body.grants ?? [],
      actor.type === 'board' ? actor.userId : null,
    )
    if (!updated) throw notFound('Member not found')
    return NextResponse.json(updated)
  } catch (err) {
    return handleError(err)
  }
}
