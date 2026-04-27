import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, secretService, logActivity } from '@/services/index'
import { syncInstructionsBundleConfigFromFilePath } from '@/services/index'
import { updateAgentInstructionsPathSchema } from '@paperclipai/shared'
import {
  assertCanManageInstructionsPath,
  asRecord,
  asNonEmptyString,
  DEFAULT_INSTRUCTIONS_PATH_KEYS,
  resolveInstructionsFilePath,
  STRICT_SECRETS_MODE,
} from '../../_shared'

export const maxDuration = 30

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = agentService(db)
    const secretsSvc = secretService(db)
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    await assertCanManageInstructionsPath(actor, existing)

    const body = await parseBody(req, updateAgentInstructionsPathSchema)
    const existingAdapterConfig = asRecord(existing.adapterConfig) ?? {}
    const explicitKey = asNonEmptyString(body.adapterConfigKey)
    const defaultKey = DEFAULT_INSTRUCTIONS_PATH_KEYS[existing.adapterType] ?? null
    const adapterConfigKey = explicitKey ?? defaultKey

    if (!adapterConfigKey) {
      return NextResponse.json(
        {
          error: `No default instructions path key for adapter type '${existing.adapterType}'. Provide adapterConfigKey.`,
        },
        { status: 422 },
      )
    }

    const nextAdapterConfig: Record<string, unknown> = { ...existingAdapterConfig }
    if (body.path === null) {
      delete nextAdapterConfig[adapterConfigKey]
    } else {
      nextAdapterConfig[adapterConfigKey] = resolveInstructionsFilePath(body.path, existingAdapterConfig)
    }

    const syncedAdapterConfig = syncInstructionsBundleConfigFromFilePath(existing, nextAdapterConfig)
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      syncedAdapterConfig,
      { strictMode: STRICT_SECRETS_MODE },
    )

    const actorInfo = getActorInfo(actor)
    const agent = await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actorInfo.agentId,
          createdByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
          source: 'instructions_path_patch',
        },
      },
    )
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const updatedAdapterConfig = asRecord(agent.adapterConfig) ?? {}
    const pathValue = asNonEmptyString(updatedAdapterConfig[adapterConfigKey])

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'agent.instructions_path_updated',
      entityType: 'agent',
      entityId: agent.id,
      details: {
        adapterConfigKey,
        path: pathValue,
        cleared: body.path === null,
      },
    })

    return NextResponse.json({
      agentId: agent.id,
      adapterType: agent.adapterType,
      adapterConfigKey,
      path: pathValue,
    })
  } catch (err) {
    return handleError(err)
  }
}
