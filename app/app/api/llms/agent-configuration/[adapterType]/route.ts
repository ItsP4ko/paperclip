import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { agentService } from '@/services/agents'
import { listServerAdapters } from '@/adapters/index'
import { db } from '@/lib/db'

export const maxDuration = 30

function hasCreatePermission(agent: { role: string; permissions: Record<string, unknown> | null | undefined }) {
  if (!agent.permissions || typeof agent.permissions !== 'object') return false
  return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ adapterType: string }> },
) {
  try {
    const actor = await resolveActor(req)

    if (actor.type === 'board') {
      // allowed
    } else if (actor.type === 'agent' && actor.agentId) {
      const agentsSvc = agentService(db)
      const actorAgent = await agentsSvc.getById(actor.agentId)
      if (!actorAgent || !hasCreatePermission(actorAgent)) {
        throw forbidden('Missing permission to read agent configuration reflection')
      }
    } else {
      throw forbidden('Board or permitted agent authentication required')
    }

    const { adapterType } = await params
    const adapter = listServerAdapters().find((entry) => entry.type === adapterType)
    if (!adapter) {
      return new NextResponse(`Unknown adapter type: ${adapterType}`, {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    const text =
      adapter.agentConfigurationDoc ??
      `# ${adapterType} agent configuration\n\nNo adapter-specific documentation registered.`

    return new NextResponse(text, { headers: { 'Content-Type': 'text/plain' } })
  } catch (err) {
    return handleError(err)
  }
}
