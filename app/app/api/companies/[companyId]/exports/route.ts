import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import type { Actor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { companyPortabilityService, agentService } from '@/services/index'
import { companyPortabilityExportSchema } from '@paperclipai/shared'

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
    await assertCanManagePortability(actor, companyId, 'exports')
    const body = await parseBody(req, companyPortabilityExportSchema)
    const portability = companyPortabilityService(db)
    const result = await portability.exportBundle(companyId, body)
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
