import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { badRequest } from '@/server/errors'
import { db } from '@/lib/db'
import { analyticsService } from '@/services/index'

export const maxDuration = 30

const VALID_GRANULARITIES = new Set(['day', 'week', 'month'])
const VALID_GROUP_BY = new Set(['agent', 'provider', 'model'])

function parseDateRange(searchParams: URLSearchParams) {
  const fromRaw = searchParams.get('from') ?? undefined
  const toRaw = searchParams.get('to') ?? undefined
  const from = fromRaw ? new Date(fromRaw) : undefined
  const to = toRaw ? new Date(toRaw) : undefined
  if (from && isNaN(from.getTime())) throw badRequest("invalid 'from' date")
  if (to && isNaN(to.getTime())) throw badRequest("invalid 'to' date")
  return from || to ? { from, to } : undefined
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

    const analytics = analyticsService(db)
    const endpoint = searchParams.get('endpoint')
    const range = parseDateRange(searchParams)

    if (endpoint === 'spend-over-time') {
      const granularity = searchParams.get('granularity') ?? 'day'
      if (!VALID_GRANULARITIES.has(granularity)) {
        throw badRequest('granularity must be day, week, or month')
      }
      const groupBy = searchParams.get('groupBy') ?? 'agent'
      if (!VALID_GROUP_BY.has(groupBy)) {
        throw badRequest('groupBy must be agent, provider, or model')
      }
      const rows = await analytics.spendOverTime(
        companyId,
        granularity as 'day' | 'week' | 'month',
        groupBy as 'agent' | 'provider' | 'model',
        range,
      )
      return NextResponse.json(rows)
    }

    if (endpoint === 'agent-performance') {
      const agentId = searchParams.get('agentId') ?? undefined
      const rows = await analytics.agentPerformance(companyId, range, agentId)
      return NextResponse.json(rows)
    }

    if (endpoint === 'adapter-comparison') {
      const rows = await analytics.adapterComparison(companyId, range)
      return NextResponse.json(rows)
    }

    return NextResponse.json({ error: 'endpoint query param required (spend-over-time, agent-performance, adapter-comparison)' }, { status: 400 })
  } catch (err) {
    return handleError(err)
  }
}
