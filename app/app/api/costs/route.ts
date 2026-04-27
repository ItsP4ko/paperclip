import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { badRequest } from '@/server/errors'
import { db } from '@/lib/db'
import {
  budgetService,
  costService,
  financeService,
  companyService,
  agentService,
  heartbeatService,
  logActivity,
} from '@/services/index'
import { fetchAllQuotaWindows } from '@/services/quota-windows'
import {
  createCostEventSchema,
  createFinanceEventSchema,
  resolveBudgetIncidentSchema,
  updateBudgetSchema,
  upsertBudgetPolicySchema,
} from '@paperclipai/shared'

export const maxDuration = 30

function parseDateRange(searchParams: URLSearchParams) {
  const fromRaw = searchParams.get('from') ?? undefined
  const toRaw = searchParams.get('to') ?? undefined
  const from = fromRaw ? new Date(fromRaw) : undefined
  const to = toRaw ? new Date(toRaw) : undefined
  if (from && isNaN(from.getTime())) throw badRequest("invalid 'from' date")
  if (to && isNaN(to.getTime())) throw badRequest("invalid 'to' date")
  return from || to ? { from, to } : undefined
}

function parseLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get('limit')
  if (raw == null || raw === '') return 100
  const limit = Number.parseInt(raw, 10)
  if (!Number.isFinite(limit) || limit <= 0 || limit > 500) {
    throw badRequest("invalid 'limit' value")
  }
  return limit
}

function getBudgetHooks() {
  const heartbeat = heartbeatService(db)
  return { cancelWorkForScope: heartbeat.cancelBudgetScopeWork }
}

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const budgetHooks = getBudgetHooks()
    const costs = costService(db, budgetHooks)
    const finance = financeService(db)
    const budgets = budgetService(db, budgetHooks)
    const companies = companyService(db)

    const endpoint = searchParams.get('endpoint')
    const range = parseDateRange(searchParams)

    if (endpoint === 'summary') {
      return NextResponse.json(await costs.summary(companyId, range))
    }
    if (endpoint === 'by-agent') {
      return NextResponse.json(await costs.byAgent(companyId, range))
    }
    if (endpoint === 'by-agent-model') {
      return NextResponse.json(await costs.byAgentModel(companyId, range))
    }
    if (endpoint === 'by-provider') {
      return NextResponse.json(await costs.byProvider(companyId, range))
    }
    if (endpoint === 'by-biller') {
      return NextResponse.json(await costs.byBiller(companyId, range))
    }
    if (endpoint === 'finance-summary') {
      return NextResponse.json(await finance.summary(companyId, range))
    }
    if (endpoint === 'finance-by-biller') {
      return NextResponse.json(await finance.byBiller(companyId, range))
    }
    if (endpoint === 'finance-by-kind') {
      return NextResponse.json(await finance.byKind(companyId, range))
    }
    if (endpoint === 'finance-events') {
      const limit = parseLimit(searchParams)
      return NextResponse.json(await finance.list(companyId, range, limit))
    }
    if (endpoint === 'window-spend') {
      return NextResponse.json(await costs.windowSpend(companyId))
    }
    if (endpoint === 'quota-windows') {
      assertBoard(actor)
      const company = await companies.getById(companyId)
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      }
      return NextResponse.json(await fetchAllQuotaWindows())
    }
    if (endpoint === 'by-project') {
      return NextResponse.json(await costs.byProject(companyId, range))
    }
    if (endpoint === 'budgets-overview') {
      return NextResponse.json(await budgets.overview(companyId))
    }

    return NextResponse.json(
      { error: 'endpoint query param required' },
      { status: 400 },
    )
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const endpoint = searchParams.get('endpoint')
    const budgetHooks = getBudgetHooks()
    const costs = costService(db, budgetHooks)
    const finance = financeService(db)
    const budgets = budgetService(db, budgetHooks)

    if (endpoint === 'cost-event') {
      const body = await parseBody(req, createCostEventSchema)
      if (actor.type === 'agent' && actor.agentId !== body.agentId) {
        return NextResponse.json({ error: 'Agent can only report its own costs' }, { status: 403 })
      }
      const event = await costs.createEvent(companyId, {
        ...body,
        occurredAt: new Date(body.occurredAt),
      })
      const actorInfo = getActorInfo(actor)
      await logActivity(db, {
        companyId,
        actorType: actorInfo.actorType,
        actorId: actorInfo.actorId,
        agentId: actorInfo.agentId,
        action: 'cost.reported',
        entityType: 'cost_event',
        entityId: event.id,
        details: { costCents: event.costCents, model: event.model },
      })
      return NextResponse.json(event, { status: 201 })
    }

    if (endpoint === 'finance-event') {
      assertBoard(actor)
      const body = await parseBody(req, createFinanceEventSchema)
      const event = await finance.createEvent(companyId, {
        ...body,
        occurredAt: new Date(body.occurredAt),
      })
      const actorInfo = getActorInfo(actor)
      await logActivity(db, {
        companyId,
        actorType: actorInfo.actorType,
        actorId: actorInfo.actorId,
        agentId: actorInfo.agentId,
        action: 'finance_event.reported',
        entityType: 'finance_event',
        entityId: event.id,
        details: {
          amountCents: event.amountCents,
          biller: event.biller,
          eventKind: event.eventKind,
          direction: event.direction,
        },
      })
      return NextResponse.json(event, { status: 201 })
    }

    if (endpoint === 'budget-policy') {
      assertBoard(actor)
      const body = await parseBody(req, upsertBudgetPolicySchema)
      const summary = await budgets.upsertPolicy(companyId, body, actor.userId ?? 'board')
      return NextResponse.json(summary)
    }

    return NextResponse.json({ error: 'endpoint query param required' }, { status: 400 })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const budgetHooks = getBudgetHooks()
    const budgets = budgetService(db, budgetHooks)
    const companies = companyService(db)

    const body = await parseBody(req, updateBudgetSchema)
    const company = await companies.update(companyId, { budgetMonthlyCents: body.budgetMonthlyCents })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    await logActivity(db, {
      companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'company.budget_updated',
      entityType: 'company',
      entityId: companyId,
      details: { budgetMonthlyCents: body.budgetMonthlyCents },
    })

    await budgets.upsertPolicy(
      companyId,
      {
        scopeType: 'company',
        scopeId: companyId,
        amount: body.budgetMonthlyCents,
        windowKind: 'calendar_month_utc',
      },
      actor.userId ?? 'board',
    )

    return NextResponse.json(company)
  } catch (err) {
    return handleError(err)
  }
}
