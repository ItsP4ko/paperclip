import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const agentId = req.nextUrl.searchParams.get('agentId') ?? undefined
    const limitParam = req.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10) || 200)) : undefined

    const heartbeat = heartbeatService(db)
    const runs = await heartbeat.list(companyId, agentId, limit)
    return NextResponse.json(runs)
  } catch (err) {
    return handleError(err)
  }
}
