import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { parseQuery } from '@/server/validate'
import { db } from '@/lib/db'
import { issueService } from '@/services/index'
import { agentMineInboxQuerySchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    if (actor.type !== 'agent' || !actor.agentId || !actor.companyId) {
      return NextResponse.json({ error: 'Agent authentication required' }, { status: 401 })
    }
    const query = parseQuery(req, agentMineInboxQuerySchema)
    const issuesSvc = issueService(db)
    const rows = await issuesSvc.list(actor.companyId, {
      touchedByUserId: query.userId,
      inboxArchivedByUserId: query.userId,
      status: query.status,
    })
    return NextResponse.json(rows)
  } catch (err) {
    return handleError(err)
  }
}
