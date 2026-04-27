import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { accessService } from '@/services/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const access = accessService(db)
    const members = await access.listMembers(companyId)
    return NextResponse.json(members)
  } catch (err) {
    return handleError(err)
  }
}
