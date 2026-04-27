import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService, heartbeatService } from '@/services/index'
import { redactEventPayload } from '@/redaction'

export const maxDuration = 30

export async function GET(
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

    const heartbeat = heartbeatService(db)
    const sessions = await heartbeat.listTaskSessions(id)
    return NextResponse.json(
      sessions.map((session) => ({
        ...session,
        sessionParamsJson: redactEventPayload(session.sessionParamsJson ?? null),
      })),
    )
  } catch (err) {
    return handleError(err)
  }
}
