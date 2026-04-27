import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { companySkillService } from '@/services/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; skillId: string }> },
) {
  try {
    const { companyId, skillId } = await params
    const actor = await resolveActor(req)
    assertCompanyAccess(actor, companyId)
    const svc = companySkillService(db)
    const result = await svc.updateStatus(companyId, skillId)
    if (!result) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
