import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { secretService } from '@/services/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = secretService(db)
    return NextResponse.json(svc.listProviders())
  } catch (err) {
    return handleError(err)
  }
}
