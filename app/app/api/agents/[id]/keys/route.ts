import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, logActivity } from '@/services/index'
import { createAgentKeySchema } from '@paperclipai/shared'

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
    const keys = await svc.listKeys(id)
    return NextResponse.json(keys)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { id } = await params
    const body = await parseBody(req, createAgentKeySchema)
    const svc = agentService(db)
    const key = await svc.createApiKey(id, body.name ?? 'default')

    const agent = await svc.getById(id)
    if (agent) {
      await logActivity(db, {
        companyId: agent.companyId,
        actorType: 'user',
        actorId: actor.userId ?? 'board',
        action: 'agent.key_created',
        entityType: 'agent',
        entityId: agent.id,
        details: { keyId: key.id, name: key.name },
      })
    }

    return NextResponse.json(key, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
