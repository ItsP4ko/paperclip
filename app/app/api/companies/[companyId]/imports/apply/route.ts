import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import type { Actor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { companyPortabilityService, agentService, logActivity } from '@/services/index'
import { companyPortabilityImportSchema } from '@paperclipai/shared'

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
    const body = await parseBody(req, companyPortabilityImportSchema)
    if (body.target.mode === 'existing_company' && body.target.companyId !== companyId) {
      throw forbidden('Safe import route can only target the route company')
    }
    if (body.collisionStrategy === 'replace') {
      throw forbidden('Safe import route does not allow replace collision strategy')
    }
    const actorInfo = getActorInfo(actor)
    const portability = companyPortabilityService(db)
    const result = await portability.importBundle(
      body,
      actor.type === 'board' ? actor.userId : null,
      { mode: 'agent_safe', sourceCompanyId: companyId },
    )
    await logActivity(db, {
      companyId: result.company.id,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      entityType: 'company',
      entityId: result.company.id,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'company.imported',
      details: {
        include: body.include ?? null,
        agentCount: result.agents.length,
        warningCount: result.warnings.length,
        companyAction: result.company.action,
        importMode: 'agent_safe',
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
