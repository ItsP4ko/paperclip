import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { detectAdapterModel } from '@/adapters/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; type: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, type } = await params
    assertCompanyAccess(actor, companyId)
    const detected = await detectAdapterModel(type)
    return NextResponse.json(detected)
  } catch (err) {
    return handleError(err)
  }
}
