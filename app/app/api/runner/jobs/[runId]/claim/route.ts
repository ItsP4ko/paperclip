import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { handleError, forbidden } from '@/server/errors'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'
import { createLocalAgentJwt } from '@/agent-auth-jwt'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { runId } = await params
    const isAdmin = !!(actor.isInstanceAdmin || actor.source === 'local_implicit')

    const heartbeat = heartbeatService(db)
    const result = await heartbeat.claimLocalRun(runId)

    if (!isAdmin) {
      const allowed = actor.companyIds ?? []
      if (!allowed.includes(result.run.companyId)) {
        console.warn({ runId, companyId: result.run.companyId }, '[runner] claim rejected — actor lacks company access')
        throw forbidden('Run does not belong to an accessible company')
      }
    }

    const authToken = result.agent
      ? createLocalAgentJwt(result.agent.id, result.run.companyId, result.agent.adapterType, runId)
      : null

    return NextResponse.json({ run: result.run, agent: result.agent, authToken })
  } catch (err) {
    return handleError(err)
  }
}
