/**
 * Shared helpers for agents routes — mirrors the inline helpers from server/src/routes/agents.ts
 */

import path from 'node:path'
import type { Actor } from '@/server/actor'
import { forbidden, conflict, notFound, unprocessable } from '@/server/errors'
import { db } from '@/lib/db'
import {
  agentService,
  accessService,
  companySkillService,
  secretService,
  instanceSettingsService,
} from '@/services/index'
import { isUuidLike } from '@paperclipai/shared'
import { writePaperclipSkillSyncPreference } from '@paperclipai/adapter-utils/server-utils'
import { assertCompanyAccess } from '@/server/authz'
import { redactEventPayload } from '@/redaction'
import { redactCurrentUserValue } from '@/log-redaction'
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from '@paperclipai/adapter-codex-local'
import { DEFAULT_CURSOR_LOCAL_MODEL } from '@paperclipai/adapter-cursor-local'
import { DEFAULT_GEMINI_LOCAL_MODEL } from '@paperclipai/adapter-gemini-local'
import { ensureOpenCodeModelConfiguredAndAvailable } from '@paperclipai/adapter-opencode-local/server'
import type { AgentSkillSnapshot } from '@paperclipai/shared'

export { redactCurrentUserValue }

export const STRICT_SECRETS_MODE = process.env.PAPERCLIP_SECRETS_STRICT_MODE === 'true'

export const DEFAULT_INSTRUCTIONS_PATH_KEYS: Record<string, string> = {
  claude_local: 'instructionsFilePath',
  codex_local: 'instructionsFilePath',
  gemini_local: 'instructionsFilePath',
  opencode_local: 'instructionsFilePath',
  cursor: 'instructionsFilePath',
  pi_local: 'instructionsFilePath',
}
export const DEFAULT_MANAGED_INSTRUCTIONS_ADAPTER_TYPES = new Set(Object.keys(DEFAULT_INSTRUCTIONS_PATH_KEYS))
export const KNOWN_INSTRUCTIONS_PATH_KEYS = new Set(['instructionsFilePath', 'agentsMdPath'])
export const KNOWN_INSTRUCTIONS_BUNDLE_KEYS = [
  'instructionsBundleMode',
  'instructionsRootPath',
  'instructionsEntryFile',
  'instructionsFilePath',
  'agentsMdPath',
] as const

const ADAPTERS_REQUIRING_MATERIALIZED_RUNTIME_SKILLS = new Set([
  'cursor',
  'gemini_local',
  'opencode_local',
  'pi_local',
])

export function shouldMaterializeRuntimeSkillsForAdapter(adapterType: string) {
  return ADAPTERS_REQUIRING_MATERIALIZED_RUNTIME_SKILLS.has(adapterType)
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false
  return null
}

export function parseNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function parseSchedulerHeartbeatPolicy(runtimeConfig: unknown) {
  const heartbeat = asRecord(asRecord(runtimeConfig)?.heartbeat) ?? {}
  return {
    enabled: parseBooleanLike(heartbeat.enabled) ?? true,
    intervalSec: Math.max(0, parseNumberLike(heartbeat.intervalSec) ?? 0),
  }
}

export function preserveInstructionsBundleConfig(
  existingAdapterConfig: Record<string, unknown>,
  nextAdapterConfig: Record<string, unknown>,
) {
  const nextKeys = new Set(Object.keys(nextAdapterConfig))
  if (KNOWN_INSTRUCTIONS_BUNDLE_KEYS.some((key) => nextKeys.has(key))) {
    return nextAdapterConfig
  }
  const merged = { ...nextAdapterConfig }
  for (const key of KNOWN_INSTRUCTIONS_BUNDLE_KEYS) {
    if (merged[key] === undefined && existingAdapterConfig[key] !== undefined) {
      merged[key] = existingAdapterConfig[key]
    }
  }
  return merged
}

export function applyCreateDefaultsByAdapterType(
  adapterType: string | null | undefined,
  adapterConfig: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...adapterConfig }
  if (adapterType === 'codex_local') {
    if (!asNonEmptyString(next.model)) next.model = DEFAULT_CODEX_LOCAL_MODEL
    const hasBypassFlag =
      typeof next.dangerouslyBypassApprovalsAndSandbox === 'boolean' ||
      typeof next.dangerouslyBypassSandbox === 'boolean'
    if (!hasBypassFlag) {
      next.dangerouslyBypassApprovalsAndSandbox = DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
    }
    return ensureGatewayDeviceKey(adapterType, next)
  }
  if (adapterType === 'gemini_local' && !asNonEmptyString(next.model)) {
    next.model = DEFAULT_GEMINI_LOCAL_MODEL
    return ensureGatewayDeviceKey(adapterType, next)
  }
  if (adapterType === 'cursor' && !asNonEmptyString(next.model)) {
    next.model = DEFAULT_CURSOR_LOCAL_MODEL
  }
  return ensureGatewayDeviceKey(adapterType, next)
}

import { generateKeyPairSync } from 'node:crypto'

function generateEd25519PrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync('ed25519')
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
}

function ensureGatewayDeviceKey(
  adapterType: string | null | undefined,
  adapterConfig: Record<string, unknown>,
): Record<string, unknown> {
  if (adapterType !== 'openclaw_gateway') return adapterConfig
  const disableDeviceAuth = parseBooleanLike(adapterConfig.disableDeviceAuth) === true
  if (disableDeviceAuth) return adapterConfig
  if (asNonEmptyString(adapterConfig.devicePrivateKeyPem)) return adapterConfig
  return { ...adapterConfig, devicePrivateKeyPem: generateEd25519PrivateKeyPem() }
}

export async function assertAdapterConfigConstraints(
  companyId: string,
  adapterType: string | null | undefined,
  adapterConfig: Record<string, unknown>,
) {
  if (adapterType !== 'opencode_local') return
  const secretsSvc = secretService(db)
  const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(companyId, adapterConfig)
  const runtimeEnv = asRecord(runtimeConfig.env) ?? {}
  try {
    await ensureOpenCodeModelConfiguredAndAvailable({
      model: runtimeConfig.model,
      command: runtimeConfig.command,
      cwd: runtimeConfig.cwd,
      env: runtimeEnv,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw unprocessable(`Invalid opencode_local adapterConfig: ${reason}`)
  }
}

export function resolveInstructionsFilePath(candidatePath: string, adapterConfig: Record<string, unknown>) {
  const trimmed = candidatePath.trim()
  if (path.isAbsolute(trimmed)) return trimmed
  const cwd = asNonEmptyString(adapterConfig.cwd)
  if (!cwd) {
    throw unprocessable('Relative instructions path requires adapterConfig.cwd to be set to an absolute path')
  }
  if (!path.isAbsolute(cwd)) {
    throw unprocessable('adapterConfig.cwd must be an absolute path to resolve relative instructions path')
  }
  return path.resolve(cwd, trimmed)
}

export function buildUnsupportedSkillSnapshot(
  adapterType: string,
  desiredSkills: string[] = [],
): AgentSkillSnapshot {
  return {
    adapterType,
    supported: false,
    mode: 'unsupported',
    desiredSkills,
    entries: [],
    warnings: ['This adapter does not implement skill sync yet.'],
  }
}

export async function buildRuntimeSkillConfig(
  companyId: string,
  adapterType: string,
  config: Record<string, unknown>,
) {
  const companySkills = companySkillService(db)
  const runtimeSkillEntries = await companySkills.listRuntimeSkillEntries(companyId, {
    materializeMissing: shouldMaterializeRuntimeSkillsForAdapter(adapterType),
  })
  return {
    ...config,
    paperclipRuntimeSkills: runtimeSkillEntries,
  }
}

export async function resolveDesiredSkillAssignment(
  companyId: string,
  adapterType: string,
  adapterConfig: Record<string, unknown>,
  requestedDesiredSkills: string[] | undefined,
) {
  const companySkills = companySkillService(db)
  if (!requestedDesiredSkills) {
    return {
      adapterConfig,
      desiredSkills: null as string[] | null,
      runtimeSkillEntries: null as Awaited<ReturnType<typeof companySkills.listRuntimeSkillEntries>> | null,
    }
  }
  const resolvedRequestedSkills = await companySkills.resolveRequestedSkillKeys(companyId, requestedDesiredSkills)
  const runtimeSkillEntries = await companySkills.listRuntimeSkillEntries(companyId, {
    materializeMissing: shouldMaterializeRuntimeSkillsForAdapter(adapterType),
  })
  const requiredSkills = runtimeSkillEntries.filter((entry) => entry.required).map((entry) => entry.key)
  const desiredSkills = Array.from(new Set([...requiredSkills, ...resolvedRequestedSkills]))
  return {
    adapterConfig: writePaperclipSkillSyncPreference(adapterConfig, desiredSkills),
    desiredSkills,
    runtimeSkillEntries,
  }
}

export function canCreateAgents(agent: { role: string; permissions: Record<string, unknown> | null | undefined }) {
  if (!agent.permissions || typeof agent.permissions !== 'object') return false
  return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents)
}

export function redactForRestrictedAgentView<T extends { adapterConfig: unknown; runtimeConfig: unknown }>(
  agent: T,
): T {
  return { ...agent, adapterConfig: {}, runtimeConfig: {} }
}

export function redactAgentConfiguration(agent: {
  id: string
  companyId: string
  name: string
  role: string
  title: string | null
  status: string
  reportsTo: string | null
  adapterType: string
  adapterConfig: unknown
  runtimeConfig: unknown
  permissions: unknown
  updatedAt: Date | null
} | null) {
  if (!agent) return null
  return {
    id: agent.id,
    companyId: agent.companyId,
    name: agent.name,
    role: agent.role,
    title: agent.title,
    status: agent.status,
    reportsTo: agent.reportsTo,
    adapterType: agent.adapterType,
    adapterConfig: redactEventPayload(agent.adapterConfig as Record<string, unknown>),
    runtimeConfig: redactEventPayload(agent.runtimeConfig as Record<string, unknown>),
    permissions: agent.permissions,
    updatedAt: agent.updatedAt,
  }
}

export function redactRevisionSnapshot(snapshot: unknown): Record<string, unknown> {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return {}
  const record = snapshot as Record<string, unknown>
  return {
    ...record,
    adapterConfig: redactEventPayload(
      typeof record.adapterConfig === 'object' && record.adapterConfig !== null
        ? (record.adapterConfig as Record<string, unknown>)
        : {},
    ),
    runtimeConfig: redactEventPayload(
      typeof record.runtimeConfig === 'object' && record.runtimeConfig !== null
        ? (record.runtimeConfig as Record<string, unknown>)
        : {},
    ),
    metadata:
      typeof record.metadata === 'object' && record.metadata !== null
        ? redactEventPayload(record.metadata as Record<string, unknown>)
        : record.metadata ?? null,
  }
}

export function redactConfigRevision(
  revision: Record<string, unknown> & { beforeConfig: unknown; afterConfig: unknown },
) {
  return {
    ...revision,
    beforeConfig: redactRevisionSnapshot(revision.beforeConfig),
    afterConfig: redactRevisionSnapshot(revision.afterConfig),
  }
}

export function toLeanOrgNode(node: Record<string, unknown>): Record<string, unknown> {
  const reports = Array.isArray(node.reports)
    ? (node.reports as Array<Record<string, unknown>>).map((report) => toLeanOrgNode(report))
    : []
  return {
    id: String(node.id),
    name: String(node.name),
    role: String(node.role),
    status: String(node.status),
    reports,
  }
}

export function summarizeAgentUpdateDetails(patch: Record<string, unknown>) {
  const changedTopLevelKeys = Object.keys(patch).sort()
  const details: Record<string, unknown> = { changedTopLevelKeys }
  const adapterConfigPatch = asRecord(patch.adapterConfig)
  if (adapterConfigPatch) details.changedAdapterConfigKeys = Object.keys(adapterConfigPatch).sort()
  const runtimeConfigPatch = asRecord(patch.runtimeConfig)
  if (runtimeConfigPatch) details.changedRuntimeConfigKeys = Object.keys(runtimeConfigPatch).sort()
  return details
}

export function parseSourceIssueIds(input: {
  sourceIssueId?: string | null
  sourceIssueIds?: string[]
}): string[] {
  const values: string[] = []
  if (Array.isArray(input.sourceIssueIds)) values.push(...input.sourceIssueIds)
  if (typeof input.sourceIssueId === 'string' && input.sourceIssueId.length > 0) values.push(input.sourceIssueId)
  return Array.from(new Set(values))
}

export async function getCurrentUserRedactionOptions() {
  const instanceSettings = instanceSettingsService(db)
  return { enabled: (await instanceSettings.getGeneral()).censorUsernameInLogs }
}

export async function buildAgentAccessState(
  svc: ReturnType<typeof agentService>,
  agent: NonNullable<Awaited<ReturnType<ReturnType<typeof agentService>['getById']>>>,
) {
  const access = accessService(db)
  const membership = await access.getMembership(agent.companyId, 'agent', agent.id)
  const grants = membership ? await access.listPrincipalGrants(agent.companyId, 'agent', agent.id) : []
  const hasExplicitTaskAssignGrant = grants.some((grant) => grant.permissionKey === 'tasks:assign')

  if (agent.role === 'ceo') {
    return { canAssignTasks: true, taskAssignSource: 'ceo_role' as const, membership, grants }
  }
  if (canCreateAgents(agent)) {
    return { canAssignTasks: true, taskAssignSource: 'agent_creator' as const, membership, grants }
  }
  if (hasExplicitTaskAssignGrant) {
    return { canAssignTasks: true, taskAssignSource: 'explicit_grant' as const, membership, grants }
  }
  return { canAssignTasks: false, taskAssignSource: 'none' as const, membership, grants }
}

export async function buildAgentDetail(
  svc: ReturnType<typeof agentService>,
  agent: NonNullable<Awaited<ReturnType<ReturnType<typeof agentService>['getById']>>>,
  options?: { restricted?: boolean },
) {
  const [chainOfCommand, accessState] = await Promise.all([
    svc.getChainOfCommand(agent.id),
    buildAgentAccessState(svc, agent),
  ])
  return {
    ...(options?.restricted ? redactForRestrictedAgentView(agent) : agent),
    chainOfCommand,
    access: accessState,
  }
}

export async function assertDeveloperOrAbove(actor: Actor, companyId: string) {
  if (actor.type !== 'board') return
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  if (!actor.userId) throw forbidden('Authentication required')
  const access = accessService(db)
  const membership = await access.getMembership(companyId, 'user', actor.userId)
  if (!membership || !membership.membershipRole || membership.membershipRole === 'member') {
    throw forbidden('Developer or owner role required for agent management')
  }
}

export async function assertOwnerAccess(actor: Actor, companyId: string) {
  if (actor.type !== 'board') return
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  if (!actor.userId) throw forbidden('Authentication required')
  const access = accessService(db)
  const membership = await access.getMembership(companyId, 'user', actor.userId)
  if (!membership || membership.membershipRole !== 'owner') {
    throw forbidden('Owner role required')
  }
}

export async function assertCanCreateAgentsForCompany(actor: Actor, companyId: string) {
  assertCompanyAccess(actor, companyId)
  const access = accessService(db)
  const svc = agentService(db)
  if (actor.type === 'board') {
    if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return null
    const allowed = await access.canUser(companyId, actor.userId, 'agents:create')
    if (!allowed) throw forbidden('Missing permission: agents:create')
    return null
  }
  const agentId = actor.type === 'agent' ? actor.agentId : null
  if (!agentId) throw forbidden('Agent authentication required')
  const actorAgent = await svc.getById(agentId)
  if (!actorAgent || actorAgent.companyId !== companyId) {
    throw forbidden('Agent key cannot access another company')
  }
  const allowedByGrant = await access.hasPermission(companyId, 'agent', actorAgent.id, 'agents:create')
  if (!allowedByGrant && !canCreateAgents(actorAgent)) {
    throw forbidden('Missing permission: can create agents')
  }
  return actorAgent
}

export async function assertCanReadConfigurations(actor: Actor, companyId: string) {
  return assertCanCreateAgentsForCompany(actor, companyId)
}

export async function actorCanReadConfigurationsForCompany(actor: Actor, companyId: string) {
  assertCompanyAccess(actor, companyId)
  const access = accessService(db)
  const svc = agentService(db)
  if (actor.type === 'board') {
    if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return true
    return access.canUser(companyId, actor.userId, 'agents:create')
  }
  const agentId = actor.type === 'agent' ? actor.agentId : null
  if (!agentId) return false
  const actorAgent = await svc.getById(agentId)
  if (!actorAgent || actorAgent.companyId !== companyId) return false
  const allowedByGrant = await access.hasPermission(companyId, 'agent', actorAgent.id, 'agents:create')
  return allowedByGrant || canCreateAgents(actorAgent)
}

export async function assertCanUpdateAgent(
  actor: Actor,
  targetAgent: { id: string; companyId: string },
) {
  assertCompanyAccess(actor, targetAgent.companyId)
  const access = accessService(db)
  const svc = agentService(db)
  if (actor.type === 'board') {
    await assertDeveloperOrAbove(actor, targetAgent.companyId)
    return
  }
  const agentId = actor.type === 'agent' ? actor.agentId : null
  if (!agentId) throw forbidden('Agent authentication required')
  const actorAgent = await svc.getById(agentId)
  if (!actorAgent || actorAgent.companyId !== targetAgent.companyId) {
    throw forbidden('Agent key cannot access another company')
  }
  if (actorAgent.id === targetAgent.id) return
  if (actorAgent.role === 'ceo') return
  const allowedByGrant = await access.hasPermission(targetAgent.companyId, 'agent', actorAgent.id, 'agents:create')
  if (allowedByGrant || canCreateAgents(actorAgent)) return
  throw forbidden('Only CEO or agent creators can modify other agents')
}

export async function assertCanReadAgent(actor: Actor, targetAgent: { companyId: string }) {
  assertCompanyAccess(actor, targetAgent.companyId)
  if (actor.type === 'board') return
  const agentId = actor.type === 'agent' ? actor.agentId : null
  if (!agentId) throw forbidden('Agent authentication required')
  const svc = agentService(db)
  const actorAgent = await svc.getById(agentId)
  if (!actorAgent || actorAgent.companyId !== targetAgent.companyId) {
    throw forbidden('Agent key cannot access another company')
  }
}

export async function assertCanManageInstructionsPath(
  actor: Actor,
  targetAgent: { id: string; companyId: string },
) {
  assertCompanyAccess(actor, targetAgent.companyId)
  if (actor.type === 'board') return
  const agentId = actor.type === 'agent' ? actor.agentId : null
  if (!agentId) throw forbidden('Agent authentication required')
  const svc = agentService(db)
  const actorAgent = await svc.getById(agentId)
  if (!actorAgent || actorAgent.companyId !== targetAgent.companyId) {
    throw forbidden('Agent key cannot access another company')
  }
  if (actorAgent.id === targetAgent.id) return
  const chainOfCommand = await svc.getChainOfCommand(targetAgent.id)
  if (chainOfCommand.some((manager) => manager.id === actorAgent.id)) return
  throw forbidden('Only the target agent or an ancestor manager can update instructions path')
}

export async function applyDefaultAgentTaskAssignGrant(
  companyId: string,
  agentId: string,
  grantedByUserId: string | null,
) {
  const access = accessService(db)
  await access.ensureMembership(companyId, 'agent', agentId, 'member', 'active')
  await access.setPrincipalPermission(companyId, 'agent', agentId, 'tasks:assign', true, grantedByUserId)
}

export async function normalizeAgentId(actor: Actor, rawId: string): Promise<string> {
  const svc = agentService(db)
  const access = accessService(db)
  const raw = rawId.trim()
  if (isUuidLike(raw)) return raw

  // Resolve companyId for shortname lookup
  let companyId: string | null = null
  const companyIdQuery = actor.type === 'agent' ? actor.companyId : null
  if (companyIdQuery) {
    assertCompanyAccess(actor, companyIdQuery)
    companyId = companyIdQuery
  }

  if (!companyId) {
    throw unprocessable('Agent shortname lookup requires companyId query parameter')
  }

  const resolved = await svc.resolveByReference(companyId, raw)
  if (resolved.ambiguous) throw conflict('Agent shortname is ambiguous in this company. Use the agent ID.')
  if (!resolved.agent) throw notFound('Agent not found')
  return resolved.agent.id
}
