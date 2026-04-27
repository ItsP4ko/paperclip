import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { dashboardService } from '@/services/index'

export const maxDuration = 30

const DASHBOARD_TTL_SECONDS = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const cacheKey = `dashboard:${companyId}`

    let redis: Awaited<ReturnType<typeof getRedis>> | null = null
    try {
      redis = await getRedis()
    } catch {
      // Redis unavailable — proceed without cache
    }

    if (redis?.isReady) {
      const cached = await redis.get(cacheKey).catch(() => null)
      if (cached) {
        return NextResponse.json(JSON.parse(cached))
      }
    }

    const svc = dashboardService(db)
    const summary = await svc.summary(companyId)

    if (redis?.isReady) {
      await redis
        .set(cacheKey, JSON.stringify(summary), { EX: DASHBOARD_TTL_SECONDS })
        .catch(() => console.warn('[redis] failed to cache dashboard'))
    }

    return NextResponse.json(summary)
  } catch (err) {
    return handleError(err)
  }
}
