import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService, secretService } from '@/services/index'
import { runClaudeLogin } from '@paperclipai/adapter-claude-local/server'
import { asRecord } from '../../_shared'

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

    if (agent.adapterType !== 'claude_local') {
      return NextResponse.json({ error: 'Login is only supported for claude_local agents' }, { status: 400 })
    }

    const secretsSvc = secretService(db)
    const config = asRecord(agent.adapterConfig) ?? {}
    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(agent.companyId, config)
    const result = await runClaudeLogin({
      runId: `claude-login-${randomUUID()}`,
      agent: {
        id: agent.id,
        companyId: agent.companyId,
        name: agent.name,
        adapterType: agent.adapterType,
        adapterConfig: agent.adapterConfig,
      },
      config: runtimeConfig,
    })

    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
