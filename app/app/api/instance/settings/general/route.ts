import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, forbidden } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { getActorInfo } from '@/server/authz'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { instanceSettingsService, logActivity } from '@/services/index'
import { patchInstanceGeneralSettingsSchema } from '@paperclipai/shared'

export const maxDuration = 30

const CACHE_KEY = 'instance:settings:general'
const TTL_SECONDS = 60
const LOCAL_TTL_MS = 30 * 1000

let localCache: { value: unknown; expiresAt: number } | null = null

function assertCanManageInstanceSettings(
  actor: Awaited<ReturnType<typeof resolveActor>>,
) {
  if (actor.type !== 'board') throw forbidden('Board access required')
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  throw forbidden('Instance admin access required')
}

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    if (actor.type !== 'board') throw forbidden('Board access required')

    const now = Date.now()
    if (localCache && localCache.expiresAt > now) {
      return NextResponse.json(localCache.value)
    }

    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        const cached = await redis.get(CACHE_KEY).catch(() => null)
        if (cached) {
          const parsed = JSON.parse(cached)
          localCache = { value: parsed, expiresAt: now + LOCAL_TTL_MS }
          return NextResponse.json(parsed)
        }
      }
    } catch { /* redis unavailable */ }

    const svc = instanceSettingsService(db)
    const settings = await svc.getGeneral()
    localCache = { value: settings, expiresAt: now + LOCAL_TTL_MS }

    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        await redis.set(CACHE_KEY, JSON.stringify(settings), { EX: TTL_SECONDS }).catch(() => null)
      }
    } catch { /* redis unavailable */ }

    return NextResponse.json(settings)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertCanManageInstanceSettings(actor)

    const body = await parseBody(req, patchInstanceGeneralSettingsSchema)
    const svc = instanceSettingsService(db)
    const updated = await svc.updateGeneral(body)

    // Invalidate cache
    localCache = null
    try {
      const redis = await getRedis()
      if (redis?.isReady) {
        await redis.del(CACHE_KEY).catch(() => null)
      }
    } catch { /* redis unavailable */ }

    const actorInfo = getActorInfo(actor)
    const companyIds = await svc.listCompanyIds()
    await Promise.all(
      companyIds.map((companyId) =>
        logActivity(db, {
          companyId,
          actorType: actorInfo.actorType,
          actorId: actorInfo.actorId,
          agentId: actorInfo.agentId,
          runId: actorInfo.runId,
          action: 'instance.settings.general_updated',
          entityType: 'instance_settings',
          entityId: updated.id,
          details: {
            general: updated.general,
            changedKeys: Object.keys(body).sort(),
          },
        }),
      ),
    )

    return NextResponse.json(updated.general)
  } catch (err) {
    return handleError(err)
  }
}
