import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { agentService } from '@/services/agents'
import { db } from '@/lib/db'
import { AGENT_ICON_NAMES } from '@paperclipai/shared'

export const maxDuration = 30

function hasCreatePermission(agent: { role: string; permissions: Record<string, unknown> | null | undefined }) {
  if (!agent.permissions || typeof agent.permissions !== 'object') return false
  return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents)
}

export async function GET(req: NextRequest) {
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

    const lines = [
      '# Paperclip Agent Icon Names',
      '',
      'Set the `icon` field on hire/create payloads to one of:',
      ...AGENT_ICON_NAMES.map((name) => `- ${name}`),
      '',
      'Example:',
      '{ "name": "SearchOps", "role": "researcher", "icon": "search" }',
      '',
    ]
    return new NextResponse(lines.join('\n'), { headers: { 'Content-Type': 'text/plain' } })
  } catch (err) {
    return handleError(err)
  }
}
