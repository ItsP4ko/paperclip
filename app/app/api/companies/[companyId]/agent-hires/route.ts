import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { companies } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import {
  agentService,
  approvalService,
  issueApprovalService,
  secretService,
  logActivity,
  budgetService,
  agentInstructionsService,
} from '@/services/index'
import { createAgentHireSchema } from '@paperclipai/shared'
import { redactEventPayload } from '@/redaction'
import {
  assertCanCreateAgentsForCompany,
  applyCreateDefaultsByAdapterType,
  resolveDesiredSkillAssignment,
  assertAdapterConfigConstraints,
  applyDefaultAgentTaskAssignGrant,
  parseSourceIssueIds,
  STRICT_SECRETS_MODE,
  DEFAULT_MANAGED_INSTRUCTIONS_ADAPTER_TYPES,
  asRecord,
  asNonEmptyString,
} from '../../../agents/_shared'
import {
  loadDefaultAgentInstructionsBundle,
  resolveDefaultAgentInstructionsBundleRole,
} from '@/services/default-agent-instructions'

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    await assertCanCreateAgentsForCompany(actor, companyId)

    const body = await parseBody(req, createAgentHireSchema)
    const sourceIssueIds = parseSourceIssueIds(body as Record<string, unknown>)
    const {
      desiredSkills: requestedDesiredSkills,
      sourceIssueId: _sourceIssueId,
      sourceIssueIds: _sourceIssueIds,
      ...hireInput
    } = body as typeof body & { desiredSkills?: string[]; sourceIssueId?: string; sourceIssueIds?: string[] }

    const requestedAdapterConfig = applyCreateDefaultsByAdapterType(
      hireInput.adapterType,
      ((hireInput.adapterConfig ?? {}) as Record<string, unknown>),
    )
    const desiredSkillAssignment = await resolveDesiredSkillAssignment(
      companyId,
      hireInput.adapterType ?? '',
      requestedAdapterConfig,
      Array.isArray(requestedDesiredSkills) ? requestedDesiredSkills : undefined,
    )
    const secretsSvc = secretService(db)
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      companyId,
      desiredSkillAssignment.adapterConfig,
      { strictMode: STRICT_SECRETS_MODE },
    )
    await assertAdapterConfigConstraints(companyId, hireInput.adapterType, normalizedAdapterConfig)
    const normalizedHireInput = { ...hireInput, adapterConfig: normalizedAdapterConfig }

    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null)
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const requiresApproval = company.requireBoardApprovalForNewAgents
    const status = requiresApproval ? 'pending_approval' : 'idle'
    const svc = agentService(db)
    const createdAgent = await svc.create(companyId, {
      ...normalizedHireInput,
      status,
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    })
    const agent = await materializeDefaultInstructionsBundleForNewAgent(createdAgent)

    let approval: Awaited<ReturnType<ReturnType<typeof approvalService>['getById']>> | null = null
    const actorInfo = getActorInfo(actor)

    if (requiresApproval) {
      const approvalsSvc = approvalService(db)
      const issueApprovalsSvc = issueApprovalService(db)
      const requestedAdapterType = normalizedHireInput.adapterType ?? agent.adapterType
      const requestedAdapterConfigRedacted =
        redactEventPayload(
          (agent.adapterConfig ?? normalizedHireInput.adapterConfig) as Record<string, unknown>,
        ) ?? {}
      const requestedRuntimeConfigRedacted =
        redactEventPayload(
          (normalizedHireInput.runtimeConfig ?? agent.runtimeConfig) as Record<string, unknown>,
        ) ?? {}
      const requestedMetadataRedacted =
        redactEventPayload(
          ((normalizedHireInput.metadata ?? agent.metadata ?? {}) as Record<string, unknown>),
        ) ?? {}

      approval = await approvalsSvc.create(companyId, {
        type: 'hire_agent',
        requestedByAgentId: actorInfo.actorType === 'agent' ? actorInfo.actorId : null,
        requestedByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
        status: 'pending',
        payload: {
          name: normalizedHireInput.name,
          role: normalizedHireInput.role,
          title: normalizedHireInput.title ?? null,
          icon: normalizedHireInput.icon ?? null,
          reportsTo: normalizedHireInput.reportsTo ?? null,
          capabilities: normalizedHireInput.capabilities ?? null,
          adapterType: requestedAdapterType,
          adapterConfig: requestedAdapterConfigRedacted,
          runtimeConfig: requestedRuntimeConfigRedacted,
          budgetMonthlyCents:
            typeof normalizedHireInput.budgetMonthlyCents === 'number'
              ? normalizedHireInput.budgetMonthlyCents
              : agent.budgetMonthlyCents,
          desiredSkills: desiredSkillAssignment.desiredSkills,
          metadata: requestedMetadataRedacted,
          agentId: agent.id,
          requestedByAgentId: actorInfo.actorType === 'agent' ? actorInfo.actorId : null,
          requestedConfigurationSnapshot: {
            adapterType: requestedAdapterType,
            adapterConfig: requestedAdapterConfigRedacted,
            runtimeConfig: requestedRuntimeConfigRedacted,
            desiredSkills: desiredSkillAssignment.desiredSkills,
          },
        },
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        updatedAt: new Date(),
      })

      if (sourceIssueIds.length > 0) {
        await issueApprovalsSvc.linkManyForApproval(approval.id, sourceIssueIds, {
          agentId: actorInfo.actorType === 'agent' ? actorInfo.actorId : null,
          userId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
        })
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'agent.hire_created',
      entityType: 'agent',
      entityId: agent.id,
      details: {
        name: agent.name,
        role: agent.role,
        requiresApproval,
        approvalId: approval?.id ?? null,
        issueIds: sourceIssueIds,
        desiredSkills: desiredSkillAssignment.desiredSkills,
      },
    })

    await applyDefaultAgentTaskAssignGrant(
      companyId,
      agent.id,
      actorInfo.actorType === 'user' ? actorInfo.actorId : null,
    )

    if (approval) {
      await logActivity(db, {
        companyId,
        actorType: actorInfo.actorType,
        actorId: actorInfo.actorId,
        agentId: actorInfo.agentId,
        runId: actorInfo.runId,
        action: 'approval.created',
        entityType: 'approval',
        entityId: approval.id,
        details: { type: approval.type, linkedAgentId: agent.id },
      })
    }

    return NextResponse.json({ agent, approval }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
