import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, notFound } from '@/server/errors'
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
    const removed = await access.demoteInstanceAdmin(userId)
    if (!removed) throw notFound('Instance admin role not found')
    return NextResponse.json(removed)
  } catch (err) {
    return handleError(err)
  }
}
