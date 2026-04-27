import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { assertInstanceAdmin } from '@/server/authz'
import { db } from '@/lib/db'
import { accessService } from '@/services/index'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertInstanceAdmin(actor)
    const { userId } = await params
    const access = accessService(db)
    const result = await access.promoteInstanceAdmin(userId)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
