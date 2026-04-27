import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { db } from '@/lib/db'
import { companyService } from '@/services/index'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const svc = companyService(db)
    const allowed =
      actor.source === 'local_implicit' || actor.isInstanceAdmin
        ? null
        : new Set(actor.companyIds ?? [])
    const stats = await svc.stats()
    if (!allowed) {
      return NextResponse.json(stats)
    }
    const filtered = Object.fromEntries(
      Object.entries(stats).filter(([companyId]) => allowed.has(companyId)),
    )
    return NextResponse.json(filtered)
  } catch (err) {
    return handleError(err)
  }
}
