import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { assertInstanceAdmin } from '@/server/authz'
import { db } from '@/lib/db'
import { accessService } from '@/services/index'
import { updateUserCompanyAccessSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertInstanceAdmin(actor)
    const { userId } = await params
    const access = accessService(db)
    const memberships = await access.listUserCompanyAccess(userId)
    return NextResponse.json(memberships)
  } catch (err) {
    return handleError(err)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertInstanceAdmin(actor)
    const { userId } = await params
    const body = await parseBody(req, updateUserCompanyAccessSchema)
    const access = accessService(db)
    const memberships = await access.setUserCompanyAccess(userId, body.companyIds ?? [])
    return NextResponse.json(memberships)
  } catch (err) {
    return handleError(err)
  }
}
