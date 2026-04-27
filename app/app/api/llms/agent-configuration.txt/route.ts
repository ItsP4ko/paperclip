import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { listServerAdapters } from '@/adapters/index'
import { agentService } from '@/services/agents'
import { db } from '@/lib/db'

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

    const adapters = listServerAdapters().sort((a, b) => a.type.localeCompare(b.type))
    const lines = [
      '# Paperclip Agent Configuration Index',
      '',
      'Installed adapters:',
      ...adapters.map((adapter) => `- ${adapter.type}: /llms/agent-configuration/${adapter.type}.txt`),
      '',
      'Related API endpoints:',
      '- GET /api/companies/:companyId/agent-configurations',
      '- GET /api/agents/:id/configuration',
      '- POST /api/companies/:companyId/agent-hires',
      '',
      'Agent identity references:',
      '- GET /llms/agent-icons.txt',
      '',
      'Notes:',
      '- Sensitive values are redacted in configuration read APIs.',
      '- New hires may be created in pending_approval state depending on company settings.',
      '',
    ]
    return new NextResponse(lines.join('\n'), { headers: { 'Content-Type': 'text/plain' } })
  } catch (err) {
    return handleError(err)
  }
}
