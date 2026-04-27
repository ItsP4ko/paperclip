import { NextRequest, NextResponse } from 'next/server'
import { handleError, forbidden } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import type { Actor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import {
  companySkillService,
  agentService,
  accessService,
  logActivity,
} from '@/services/index'
import { companySkillProjectScanRequestSchema } from '@paperclipai/shared'

export const maxDuration = 30

function canCreateAgents(agent: { permissions: Record<string, unknown> | null | undefined }) {
  if (!agent.permissions || typeof agent.permissions !== 'object') return false
  return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents)
}

async function assertCanMutateCompanySkills(actor: Actor, companyId: string) {
  assertCompanyAccess(actor, companyId)

  if (actor.type === 'board') {
    if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
    const access = accessService(db)
    const allowed = await access.canUser(companyId, actor.userId, 'agents:create')
    if (!allowed) {
      throw forbidden('Missing permission: agents:create')
    }
    return
  }

  if (actor.type !== 'agent') {
    throw forbidden('Agent authentication required')
  }

  const agents = agentService(db)
  const actorAgent = await agents.getById(actor.agentId)
  if (!actorAgent || actorAgent.companyId !== companyId) {
    throw forbidden('Agent key cannot access another company')
  }

  const access = accessService(db)
  const allowedByGrant = await access.hasPermission(companyId, 'agent', actorAgent.id, 'agents:create')
  if (allowedByGrant || canCreateAgents(actorAgent)) {
    return
  }

  throw forbidden('Missing permission: can create agents')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params
    const actor = await resolveActor(req)
    await assertCanMutateCompanySkills(actor, companyId)
    const body = await parseBody(req, companySkillProjectScanRequestSchema)
    const svc = companySkillService(db)
    const result = await svc.scanProjectWorkspaces(companyId, body)

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'company.skills_scanned',
      entityType: 'company',
      entityId: companyId,
      details: {
        scannedProjects: result.scannedProjects,
        scannedWorkspaces: result.scannedWorkspaces,
        discovered: result.discovered,
        importedCount: result.imported.length,
        updatedCount: result.updated.length,
        conflictCount: result.conflicts.length,
        warningCount: result.warnings.length,
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
