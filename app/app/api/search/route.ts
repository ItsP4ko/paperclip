import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { searchService, type SearchEntityType } from '@/services/search'

export const maxDuration = 30

const VALID_TYPES = new Set(['issue', 'agent', 'project', 'knowledge', 'run'])

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const q = searchParams.get('q')?.trim()
    if (!q) {
      return NextResponse.json([])
    }

    const typesParam = searchParams.get('types') ?? undefined
    let types: SearchEntityType[] | undefined
    if (typesParam) {
      types = typesParam
        .split(',')
        .map((t) => t.trim())
        .filter((t) => VALID_TYPES.has(t)) as SearchEntityType[]
    }

    const limitParam = searchParams.get('limit') ?? undefined
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 50) : 20

    const svc = searchService(db)
    const results = await svc.search(companyId, q, { types, limit })
    return NextResponse.json(results)
  } catch (err) {
    return handleError(err)
  }
}
