import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, heartbeatService, logActivity } from '@/services/index'
import { resetAgentSessionSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { id } = await params
    const svc = agentService(db)
    const agent = await svc.getById(id)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    assertCompanyAccess(actor, agent.companyId)

    const body = await parseBody(req, resetAgentSessionSchema)
    const taskKey =
      typeof body.taskKey === 'string' && body.taskKey.trim().length > 0
        ? body.taskKey.trim()
        : null

    const heartbeat = heartbeatService(db)
    const state = await heartbeat.resetRuntimeSession(id, { taskKey })

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'agent.runtime_session_reset',
      entityType: 'agent',
      entityId: id,
      details: { taskKey: taskKey ?? null },
    })

    return NextResponse.json(state)
  } catch (err) {
    return handleError(err)
  }
}
