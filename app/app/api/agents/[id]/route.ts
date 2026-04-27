import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, logActivity, secretService, heartbeatService } from '@/services/index'
import { updateAgentSchema } from '@paperclipai/shared'
import { syncInstructionsBundleConfigFromFilePath } from '@/services/index'
import {
  buildAgentDetail,
  actorCanReadConfigurationsForCompany,
  assertCanUpdateAgent,
  assertDeveloperOrAbove,
  assertCanManageInstructionsPath,
  applyCreateDefaultsByAdapterType,
  asRecord,
  asNonEmptyString,
  KNOWN_INSTRUCTIONS_PATH_KEYS,
  KNOWN_INSTRUCTIONS_BUNDLE_KEYS,
  preserveInstructionsBundleConfig,
  summarizeAgentUpdateDetails,
  STRICT_SECRETS_MODE,
  assertAdapterConfigConstraints,
} from '../_shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = agentService(db)
    const agent = await svc.getById(id)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    assertCompanyAccess(actor, agent.companyId)
    if (actor.type === 'agent' && actor.agentId !== id) {
      const canRead = await actorCanReadConfigurationsForCompany(actor, agent.companyId)
      if (!canRead) {
        return NextResponse.json(await buildAgentDetail(svc, agent, { restricted: true }))
      }
    }
    return NextResponse.json(await buildAgentDetail(svc, agent))
  } catch (err) {
    return handleError(err)
  }
}

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
    await assertCanUpdateAgent(actor, existing)

    const body = await parseBody(req, updateAgentSchema)

    if (Object.prototype.hasOwnProperty.call(body, 'permissions')) {
      return NextResponse.json(
        { error: 'Use /api/agents/:id/permissions for permission changes' },
        { status: 422 },
      )
    }

    const patchData = { ...(body as Record<string, unknown>) }
    const replaceAdapterConfig = patchData.replaceAdapterConfig === true
    delete patchData.replaceAdapterConfig

    if (Object.prototype.hasOwnProperty.call(patchData, 'adapterConfig')) {
      const adapterConfig = asRecord(patchData.adapterConfig)
      if (!adapterConfig) {
        return NextResponse.json({ error: 'adapterConfig must be an object' }, { status: 422 })
      }
      const changingInstructionsPath = Object.keys(adapterConfig).some((key) =>
        KNOWN_INSTRUCTIONS_PATH_KEYS.has(key),
      )
      if (changingInstructionsPath) {
        await assertCanManageInstructionsPath(actor, existing)
      }
      patchData.adapterConfig = adapterConfig
    }

    const requestedAdapterType =
      typeof patchData.adapterType === 'string' ? patchData.adapterType : existing.adapterType
    const touchesAdapterConfiguration =
      Object.prototype.hasOwnProperty.call(patchData, 'adapterType') ||
      Object.prototype.hasOwnProperty.call(patchData, 'adapterConfig')

    if (touchesAdapterConfiguration) {
      const existingAdapterConfig = asRecord(existing.adapterConfig) ?? {}
      const changingAdapterType =
        typeof patchData.adapterType === 'string' && patchData.adapterType !== existing.adapterType
      const requestedAdapterConfig = Object.prototype.hasOwnProperty.call(patchData, 'adapterConfig')
        ? (asRecord(patchData.adapterConfig) ?? {})
        : null

      if (
        requestedAdapterConfig &&
        replaceAdapterConfig &&
        KNOWN_INSTRUCTIONS_BUNDLE_KEYS.some(
          (key) => existingAdapterConfig[key] !== undefined && requestedAdapterConfig[key] === undefined,
        )
      ) {
        await assertCanManageInstructionsPath(actor, existing)
      }

      let rawEffectiveAdapterConfig = requestedAdapterConfig ?? existingAdapterConfig
      if (requestedAdapterConfig && !changingAdapterType && !replaceAdapterConfig) {
        rawEffectiveAdapterConfig = { ...existingAdapterConfig, ...requestedAdapterConfig }
      }
      if (changingAdapterType) {
        const ADAPTER_AGNOSTIC_KEYS = [
          'env', 'cwd', 'timeoutSec', 'graceSec', 'promptTemplate', 'bootstrapPromptTemplate',
        ] as const
        for (const key of ADAPTER_AGNOSTIC_KEYS) {
          if (rawEffectiveAdapterConfig[key] === undefined && existingAdapterConfig[key] !== undefined) {
            rawEffectiveAdapterConfig = { ...rawEffectiveAdapterConfig, [key]: existingAdapterConfig[key] }
          }
        }
        rawEffectiveAdapterConfig = preserveInstructionsBundleConfig(existingAdapterConfig, rawEffectiveAdapterConfig)
      }
      const effectiveAdapterConfig = applyCreateDefaultsByAdapterType(requestedAdapterType, rawEffectiveAdapterConfig)
      const normalizedEffectiveAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        existing.companyId,
        effectiveAdapterConfig,
        { strictMode: STRICT_SECRETS_MODE },
      )
      patchData.adapterConfig = syncInstructionsBundleConfigFromFilePath(existing, normalizedEffectiveAdapterConfig)
    }

    if (touchesAdapterConfiguration && requestedAdapterType === 'opencode_local') {
      const effectiveAdapterConfig = asRecord(patchData.adapterConfig) ?? {}
      await assertAdapterConfigConstraints(existing.companyId, requestedAdapterType, effectiveAdapterConfig)
    }

    const actorInfo = getActorInfo(actor)
    const agent = await svc.update(id, patchData, {
      recordRevision: {
        createdByAgentId: actorInfo.agentId,
        createdByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
        source: 'patch',
      },
    })
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'agent.updated',
      entityType: 'agent',
      entityId: agent.id,
      details: summarizeAgentUpdateDetails(patchData),
    })

    return NextResponse.json(agent)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { id } = await params
    const svc = agentService(db)
    const toDelete = await svc.getById(id)
    if (toDelete) await assertDeveloperOrAbove(actor, toDelete.companyId)
    const agent = await svc.remove(id)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'agent.deleted',
      entityType: 'agent',
      entityId: agent.id,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
