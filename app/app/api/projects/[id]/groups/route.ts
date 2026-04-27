import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { groupService } from '@/services/groups'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const companyIdQuery = req.nextUrl.searchParams.get('companyId')
    if (companyIdQuery) {
      assertCompanyAccess(actor, companyIdQuery)
    }
    const svc = groupService(db)
    const result = await svc.listGroupsForProject(id)
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
