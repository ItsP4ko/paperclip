import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { activityService, issueService, logActivity } from '@/services/index'
import { sanitizeRecord } from '@/redaction'
import { z } from 'zod'

export const maxDuration = 30

const createActivitySchema = z.object({
  actorType: z.enum(['agent', 'user', 'system']).optional().default('system'),
  actorId: z.string().min(1),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  agentId: z.string().uuid().optional().nullable(),
  details: z.record(z.unknown()).optional().nullable(),
})

function parsePagination(searchParams: URLSearchParams) {
  const rawLimit = searchParams.get('limit')
  const rawOffset = searchParams.get('offset')
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined
  const offset = rawOffset ? Number.parseInt(rawOffset, 10) : undefined
  return {
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
  }
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

    const svc = activityService(db)
    const filters = {
      companyId,
      agentId: searchParams.get('agentId') ?? undefined,
      entityType: searchParams.get('entityType') ?? undefined,
      entityId: searchParams.get('entityId') ?? undefined,
    }
    const result = await svc.list(filters, parsePagination(searchParams))
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=5' },
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { searchParams } = req.nextUrl
    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    const body = await parseBody(req, createActivitySchema)
    const svc = activityService(db)
    const event = await svc.create({
      companyId,
      ...body,
      details: body.details ? sanitizeRecord(body.details) : null,
    })
    return NextResponse.json(event, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
