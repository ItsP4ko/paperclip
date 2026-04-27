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
import { companySkillFileUpdateSchema } from '@paperclipai/shared'

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  try {
    const { id: companyId, skillId } = await params
    const relativePath = req.nextUrl.searchParams.get('path') ?? 'SKILL.md'
    const actor = await resolveActor(req)
    assertCompanyAccess(actor, companyId)
    const svc = companySkillService(db)
    const result = await svc.readFile(companyId, skillId, relativePath)
    if (!result) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  try {
    const { id: companyId, skillId } = await params
    const actor = await resolveActor(req)
    await assertCanMutateCompanySkills(actor, companyId)
    const body = await parseBody(req, companySkillFileUpdateSchema)
    const svc = companySkillService(db)
    const result = await svc.updateFile(
      companyId,
      skillId,
      String(body.path ?? ''),
      String(body.content ?? ''),
    )

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'company.skill_file_updated',
      entityType: 'company_skill',
      entityId: skillId,
      details: {
        path: result.path,
        markdown: result.markdown,
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
