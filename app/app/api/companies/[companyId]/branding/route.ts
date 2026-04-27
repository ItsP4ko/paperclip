import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import type { Actor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { companyService, agentService, logActivity } from '@/services/index'
import { updateCompanyBrandingSchema } from '@paperclipai/shared'

export const maxDuration = 30

async function assertCanUpdateBranding(actor: Actor, companyId: string) {
  assertCompanyAccess(actor, companyId)
  if (actor.type === 'board') return
  if (actor.type !== 'agent') throw forbidden('Agent authentication required')

  const agents = agentService(db)
  const actorAgent = await agents.getById(actor.agentId)
  if (!actorAgent || actorAgent.companyId !== companyId) {
    throw forbidden('Agent key cannot access another company')
  }
  if (actorAgent.role !== 'ceo') {
    throw forbidden('Only CEO agents can update company branding')
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params
    const actor = await resolveActor(req)
    await assertCanUpdateBranding(actor, companyId)
    const body = await parseBody(req, updateCompanyBrandingSchema)
    const svc = companyService(db)
    const company = await svc.update(companyId, body)
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'company.branding_updated',
      entityType: 'company',
      entityId: companyId,
      details: body,
    })
    return NextResponse.json(company)
  } catch (err) {
    return handleError(err)
  }
}
