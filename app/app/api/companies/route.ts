import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import {
  companyService,
  accessService,
  budgetService,
  logActivity,
} from '@/services/index'
import { createCompanySchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const svc = companyService(db)
    const result = await svc.list()
    if (actor.source === 'local_implicit' || actor.isInstanceAdmin) {
      return NextResponse.json(result)
    }
    const allowed = new Set(actor.companyIds ?? [])
    return NextResponse.json(result.filter((company) => allowed.has(company.id)))
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    if (!(actor.source === 'local_implicit' || actor.isInstanceAdmin)) {
      throw forbidden('Instance admin required')
    }
    const body = await parseBody(req, createCompanySchema)
    const svc = companyService(db)
    const access = accessService(db)
    const budgets = budgetService(db)
    const company = await svc.create(body)
    await access.ensureMembership(company.id, 'user', actor.userId ?? 'local-board', 'owner', 'active')
    await logActivity(db, {
      companyId: company.id,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'company.created',
      entityType: 'company',
      entityId: company.id,
      details: { name: company.name },
    })
    if (company.budgetMonthlyCents > 0) {
      await budgets.upsertPolicy(
        company.id,
        {
          scopeType: 'company',
          scopeId: company.id,
          amount: company.budgetMonthlyCents,
          windowKind: 'calendar_month_utc',
        },
        actor.userId ?? 'board',
      )
    }
    return NextResponse.json(company, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
