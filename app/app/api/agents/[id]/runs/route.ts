import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService, heartbeatService } from '@/services/index'

export const maxDuration = 30

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { id: agentId } = await params
    const svc = agentService(db)
    const agent = await svc.getById(agentId)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    assertCompanyAccess(actor, agent.companyId)
    const heartbeat = heartbeatService(db)
    const deleted = await heartbeat.deleteRunsByAgent(agentId, agent.companyId)
    return NextResponse.json({ deleted })
  } catch (err) {
    return handleError(err)
  }
}
