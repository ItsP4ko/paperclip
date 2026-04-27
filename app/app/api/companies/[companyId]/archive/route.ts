import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { companyService, logActivity } from '@/services/index'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params
    const actor = await resolveActor(req)
    assertBoard(actor)
    assertCompanyAccess(actor, companyId)
    const svc = companyService(db)
    const company = await svc.archive(companyId)
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    await logActivity(db, {
      companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'company.archived',
      entityType: 'company',
      entityId: companyId,
    })
    return NextResponse.json(company)
  } catch (err) {
    return handleError(err)
  }
}
