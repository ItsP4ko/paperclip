import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess, getActorInfo } from '@/server/authz'
import { db } from '@/lib/db'
import {
  companyService,
  agentService,
  logActivity,
} from '@/services/index'
import {
  DEFAULT_FEEDBACK_DATA_SHARING_TERMS_VERSION,
  updateCompanyBrandingSchema,
  updateCompanySchema,
} from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params
    const actor = await resolveActor(req)
    assertCompanyAccess(actor, companyId)
    // Allow agents (CEO) to read their own company; board always allowed
    if (actor.type !== 'agent') {
      assertBoard(actor)
    }
    const svc = companyService(db)
    const company = await svc.getById(companyId)
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    return NextResponse.json(company)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params
    const actor = await resolveActor(req)
    assertCompanyAccess(actor, companyId)

    const actorInfo = getActorInfo(actor)
    const svc = companyService(db)
    const existingCompany = await svc.getById(companyId)
    if (!existingCompany) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    let body: Record<string, unknown>

    if (actor.type === 'agent') {
      const agents = agentService(db)
      const actorAgent = actor.agentId ? await agents.getById(actor.agentId) : null
      if (!actorAgent || actorAgent.role !== 'ceo') {
        throw forbidden('Only CEO agents or board users may update company settings')
      }
      if (actorAgent.companyId !== companyId) {
        throw forbidden('Agent key cannot access another company')
      }
      body = updateCompanyBrandingSchema.parse(await req.json())
    } else {
      assertBoard(actor)
      const raw = await req.json()
      body = updateCompanySchema.parse(raw)

      if (body.feedbackDataSharingEnabled === true && !existingCompany.feedbackDataSharingEnabled) {
        body = {
          ...body,
          feedbackDataSharingConsentAt: new Date(),
          feedbackDataSharingConsentByUserId: actor.userId ?? 'local-board',
          feedbackDataSharingTermsVersion:
            typeof body.feedbackDataSharingTermsVersion === 'string' &&
            body.feedbackDataSharingTermsVersion.length > 0
              ? body.feedbackDataSharingTermsVersion
              : DEFAULT_FEEDBACK_DATA_SHARING_TERMS_VERSION,
        }
      }
    }

    const company = await svc.update(companyId, body)
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'company.updated',
      entityType: 'company',
      entityId: companyId,
      details: body,
    })
    return NextResponse.json(company)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params
    const actor = await resolveActor(req)
    assertBoard(actor)
    assertCompanyAccess(actor, companyId)
    const svc = companyService(db)
    const company = await svc.remove(companyId)
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
