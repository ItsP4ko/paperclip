import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, accessService, budgetService, secretService, logActivity } from '@/services/index'
import { createAgentSchema } from '@paperclipai/shared'
import { syncInstructionsBundleConfigFromFilePath } from '@/services/index'
import {
  actorCanReadConfigurationsForCompany,
  assertDeveloperOrAbove,
  assertCanCreateAgentsForCompany,
  applyCreateDefaultsByAdapterType,
  resolveDesiredSkillAssignment,
  assertAdapterConfigConstraints,
  applyDefaultAgentTaskAssignGrant,
  redactForRestrictedAgentView,
  STRICT_SECRETS_MODE,
  asRecord,
  asNonEmptyString,
  DEFAULT_MANAGED_INSTRUCTIONS_ADAPTER_TYPES,
} from '../../../agents/_shared'
import { assertBoard } from '@/server/authz'
import {
  loadDefaultAgentInstructionsBundle,
  resolveDefaultAgentInstructionsBundleRole,
} from '@/services/default-agent-instructions'
import { agentInstructionsService } from '@/services/index'

export const maxDuration = 30

async function materializeDefaultInstructionsBundleForNewAgent<T extends {
  id: string
  companyId: string
  name: string
  role: string
  adapterType: string
  adapterConfig: unknown
}>(agent: T): Promise<T> {
  if (!DEFAULT_MANAGED_INSTRUCTIONS_ADAPTER_TYPES.has(agent.adapterType)) return agent
  const adapterConfig = asRecord(agent.adapterConfig) ?? {}
  const hasExplicitInstructionsBundle =
    Boolean(asNonEmptyString(adapterConfig.instructionsBundleMode)) ||
    Boolean(asNonEmptyString(adapterConfig.instructionsRootPath)) ||
    Boolean(asNonEmptyString(adapterConfig.instructionsEntryFile)) ||
    Boolean(asNonEmptyString(adapterConfig.instructionsFilePath)) ||
    Boolean(asNonEmptyString(adapterConfig.agentsMdPath))
  if (hasExplicitInstructionsBundle) return agent

  const promptTemplate = typeof adapterConfig.promptTemplate === 'string' ? adapterConfig.promptTemplate : ''
  const files = promptTemplate.trim().length === 0
    ? await loadDefaultAgentInstructionsBundle(resolveDefaultAgentInstructionsBundleRole(agent.role))
    : { 'AGENTS.md': promptTemplate }
  const instructions = agentInstructionsService()
  const materialized = await instructions.materializeManagedBundle(agent, files, { entryFile: 'AGENTS.md', replaceExisting: false })
  const nextAdapterConfig = { ...materialized.adapterConfig }
  delete nextAdapterConfig.promptTemplate
  const svc = agentService(db)
  const updated = await svc.update(agent.id, { adapterConfig: nextAdapterConfig })
  return (updated as T | null) ?? { ...agent, adapterConfig: nextAdapterConfig }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = agentService(db)
    const result = await svc.list(companyId)
    const canReadConfigs = await actorCanReadConfigurationsForCompany(actor, companyId)
    if (canReadConfigs || actor.type === 'board') {
      return NextResponse.json(result)
    }
    return NextResponse.json(result.map((agent) => redactForRestrictedAgentView(agent)))
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    await assertDeveloperOrAbove(actor, companyId)

    if (actor.type === 'agent') {
      assertBoard(actor)
    }

    const body = await parseBody(req, createAgentSchema)
    const { desiredSkills: requestedDesiredSkills, ...createInput } = body as typeof body & { desiredSkills?: string[] }
    const requestedAdapterConfig = applyCreateDefaultsByAdapterType(
      createInput.adapterType,
      ((createInput.adapterConfig ?? {}) as Record<string, unknown>),
    )
    const desiredSkillAssignment = await resolveDesiredSkillAssignment(
      companyId,
      createInput.adapterType ?? '',
      requestedAdapterConfig,
      Array.isArray(requestedDesiredSkills) ? requestedDesiredSkills : undefined,
    )
    const secretsSvc = secretService(db)
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      companyId,
      desiredSkillAssignment.adapterConfig,
      { strictMode: STRICT_SECRETS_MODE },
    )
    await assertAdapterConfigConstraints(companyId, createInput.adapterType, normalizedAdapterConfig)

    const svc = agentService(db)
    const createdAgent = await svc.create(companyId, {
      ...createInput,
      adapterConfig: normalizedAdapterConfig,
      status: 'idle',
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    })
    const agent = await materializeDefaultInstructionsBundleForNewAgent(createdAgent)

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'agent.created',
      entityType: 'agent',
      entityId: agent.id,
      details: {
        name: agent.name,
        role: agent.role,
        desiredSkills: desiredSkillAssignment.desiredSkills,
      },
    })

    await applyDefaultAgentTaskAssignGrant(
      companyId,
      agent.id,
      actor.type === 'board' ? (actor.userId ?? null) : null,
    )

    if (agent.budgetMonthlyCents > 0) {
      const budgets = budgetService(db)
      await budgets.upsertPolicy(
        companyId,
        {
          scopeType: 'agent',
          scopeId: agent.id,
          amount: agent.budgetMonthlyCents,
          windowKind: 'calendar_month_utc',
        },
        actorInfo.actorType === 'user' ? actorInfo.actorId : null,
      )
    }

    return NextResponse.json(agent, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
