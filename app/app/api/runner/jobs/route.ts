import { NextRequest, NextResponse } from 'next/server'
import { agents } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'

export const maxDuration = 30

async function resolveCompanyIds(companyIds: string[] | undefined, isAdmin: boolean): Promise<string[]> {
  if (!isAdmin) return companyIds ?? []
  if ((companyIds ?? []).length > 0) return companyIds!
  const rows = await db.selectDistinct({ companyId: agents.companyId }).from(agents)
  return rows.map((r) => r.companyId)
}

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const isAdmin = !!(actor.isInstanceAdmin || actor.source === 'local_implicit')
    const companyIds = await resolveCompanyIds(actor.companyIds, isAdmin)
    const heartbeat = heartbeatService(db)
    const jobs = await heartbeat.listPendingLocalRuns(companyIds)
    return NextResponse.json(jobs)
  } catch (err) {
    return handleError(err)
  }
}
