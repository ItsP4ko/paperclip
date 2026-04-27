import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { companyPortabilityService, logActivity } from '@/services/index'
import { companyPortabilityImportSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const body = await parseBody(req, companyPortabilityImportSchema)
    if (body.target.mode === 'existing_company') {
      assertCompanyAccess(actor, body.target.companyId)
    }
    const portability = companyPortabilityService(db)
    const actorInfo = getActorInfo(actor)
    const result = await portability.importBundle(
      body,
      actor.type === 'board' ? actor.userId : null,
    )
    await logActivity(db, {
      companyId: result.company.id,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      action: 'company.imported',
      entityType: 'company',
      entityId: result.company.id,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      details: {
        include: body.include ?? null,
        agentCount: result.agents.length,
        warningCount: result.warnings.length,
        companyAction: result.company.action,
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
