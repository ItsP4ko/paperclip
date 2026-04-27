import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, forbidden } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { getActorInfo } from '@/server/authz'
import { db } from '@/lib/db'
import { instanceSettingsService, logActivity } from '@/services/index'
import { patchInstanceExperimentalSettingsSchema } from '@paperclipai/shared'

export const maxDuration = 30

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
    const svc = instanceSettingsService(db)
    return NextResponse.json(await svc.getExperimental())
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertCanManageInstanceSettings(actor)

    const body = await parseBody(req, patchInstanceExperimentalSettingsSchema)
    const svc = instanceSettingsService(db)
    const updated = await svc.updateExperimental(body)

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
          action: 'instance.settings.experimental_updated',
          entityType: 'instance_settings',
          entityId: updated.id,
          details: {
            experimental: updated.experimental,
            changedKeys: Object.keys(body).sort(),
          },
        }),
      ),
    )

    return NextResponse.json(updated.experimental)
  } catch (err) {
    return handleError(err)
  }
}
