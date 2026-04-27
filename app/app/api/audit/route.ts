import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { badRequest } from '@/server/errors'
import { db } from '@/lib/db'
import { auditService } from '@/services/index'

export const maxDuration = 30

function parseDateRange(searchParams: URLSearchParams) {
  const fromRaw = searchParams.get('from') ?? undefined
  const toRaw = searchParams.get('to') ?? undefined
  const from = fromRaw ? new Date(fromRaw) : undefined
  const to = toRaw ? new Date(toRaw) : undefined
  if (from && isNaN(from.getTime())) throw badRequest("invalid 'from' date")
  if (to && isNaN(to.getTime())) throw badRequest("invalid 'to' date")
  return { from, to }
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

    const audit = auditService(db)
    const endpoint = searchParams.get('endpoint')

    if (endpoint === 'filters') {
      const [actions, entityTypes] = await Promise.all([
        audit.distinctActions(companyId),
        audit.distinctEntityTypes(companyId),
      ])
      return NextResponse.json({ actions, entityTypes })
    }

    if (endpoint === 'export') {
      assertBoard(actor)
      const format = searchParams.get('format') ?? 'json'
      if (format !== 'json' && format !== 'csv') {
        throw badRequest('format must be json or csv')
      }
      const { from, to } = parseDateRange(searchParams)
      const filename = `audit-${companyId}-${new Date().toISOString().slice(0, 10)}.${format}`

      const actorType = searchParams.get('actorType') ?? undefined
      const entityType = searchParams.get('entityType') ?? undefined

      if (format === 'csv') {
        const rows: string[] = ['id,created_at,actor_type,actor_id,action,entity_type,entity_id,details\n']
        for await (const batch of audit.exportBatches({ companyId, from, to, actorType, entityType })) {
          for (const row of batch) {
            const details = row.details ? JSON.stringify(row.details).replace(/"/g, '""') : ''
            rows.push(
              `${row.id},${row.createdAt.toISOString()},${row.actorType},${row.actorId},${row.action},${row.entityType},${row.entityId},"${details}"\n`,
            )
          }
        }
        return new NextResponse(rows.join(''), {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        })
      } else {
        const allRows: unknown[] = []
        for await (const batch of audit.exportBatches({ companyId, from, to, actorType, entityType })) {
          allRows.push(...batch)
        }
        return new NextResponse(JSON.stringify(allRows), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        })
      }
    }

    // Default: timeline
    const { from, to } = parseDateRange(searchParams)
    const limitRaw = searchParams.get('limit')
    const limit = limitRaw ? Math.min(Number(limitRaw), 200) : 50
    if (limitRaw && (!Number.isFinite(limit) || limit <= 0)) {
      throw badRequest("invalid 'limit' value")
    }

    const result = await audit.timeline({
      companyId,
      from,
      to,
      actorType: searchParams.get('actorType') ?? undefined,
      entityType: searchParams.get('entityType') ?? undefined,
      action: searchParams.get('action') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit,
    })
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
