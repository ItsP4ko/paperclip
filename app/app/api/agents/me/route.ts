import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService } from '@/services/index'
import { buildAgentDetail } from '../_shared'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    if (actor.type !== 'agent' || !actor.agentId) {
      return NextResponse.json({ error: 'Agent authentication required' }, { status: 401 })
    }
    const svc = agentService(db)
    const agent = await svc.getById(actor.agentId)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    return NextResponse.json(await buildAgentDetail(svc, agent))
  } catch (err) {
    return handleError(err)
  }
}
