import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService, logActivity } from '@/services/index'

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
    const agent = await svc.resume(id)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'agent.resumed',
      entityType: 'agent',
      entityId: agent.id,
    })

    return NextResponse.json(agent)
  } catch (err) {
    return handleError(err)
  }
}
