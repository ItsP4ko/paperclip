import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { notFound } from '@/server/errors'
import { parseBody, parseQuery } from '@/server/validate'
import { db } from '@/lib/db'
import { costRecommendationService } from '@/services/cost-recommendations'
import { z } from 'zod'

export const maxDuration = 30

const updateCostRecommendationSchema = z.object({
  status: z.enum(['accepted', 'dismissed']),
})

const costRecommendationsListQuerySchema = z.object({
  companyId: z.string().min(1),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const query = parseQuery(req, costRecommendationsListQuerySchema)
    assertCompanyAccess(actor, query.companyId)

    const service = costRecommendationService(db)
    const rows = await service.list(query.companyId, {
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    })
    return NextResponse.json(rows)
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

    const service = costRecommendationService(db)
    const count = await service.generate(companyId)
    return NextResponse.json({ generated: count })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id query param required' }, { status: 400 })
    }

    const body = await parseBody(req, updateCostRecommendationSchema)
    const service = costRecommendationService(db)
    const updated = await service.update(companyId, id, body.status)
    if (!updated) throw notFound('Recommendation not found')
    return NextResponse.json(updated)
  } catch (err) {
    return handleError(err)
  }
}
