import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import type { Actor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { companyPortabilityService, agentService } from '@/services/index'
import { companyPortabilityPreviewSchema } from '@paperclipai/shared'

export const maxDuration = 30

async function assertCanManagePortability(
  actor: Actor,
  companyId: string,
  capability: 'imports' | 'exports',
) {
  assertCompanyAccess(actor, companyId)
  if (actor.type === 'board') return
  if (actor.type !== 'agent') throw forbidden('Agent authentication required')

  const agents = agentService(db)
  const actorAgent = await agents.getById(actor.agentId)
  if (!actorAgent || actorAgent.companyId !== companyId) {
    throw forbidden('Agent key cannot access another company')
  }
  if (actorAgent.role !== 'ceo') {
    throw forbidden(`Only CEO agents can manage company ${capability}`)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params
    const actor = await resolveActor(req)
    await assertCanManagePortability(actor, companyId, 'imports')
    const body = await parseBody(req, companyPortabilityPreviewSchema)
    if (body.target.mode === 'existing_company' && body.target.companyId !== companyId) {
      throw forbidden('Safe import route can only target the route company')
    }
    if (body.collisionStrategy === 'replace') {
      throw forbidden('Safe import route does not allow replace collision strategy')
    }
    const portability = companyPortabilityService(db)
    const preview = await portability.previewImport(body, {
      mode: 'agent_safe',
      sourceCompanyId: companyId,
    })
    return NextResponse.json(preview)
  } catch (err) {
    return handleError(err)
  }
}
