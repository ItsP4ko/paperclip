import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { companyPortabilityService } from '@/services/index'
import { companyPortabilityExportSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params
    const actor = await resolveActor(req)
    assertCompanyAccess(actor, companyId)
    const body = await parseBody(req, companyPortabilityExportSchema)
    const portability = companyPortabilityService(db)
    const result = await portability.exportBundle(companyId, body)
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
