import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, accessService, logActivity } from '@/services/index'
import { updateAgentPermissionsSchema } from '@paperclipai/shared'
import { buildAgentDetail } from '../../_shared'

export const maxDuration = 30

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = agentService(db)
    const access = accessService(db)
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)

    if (actor.type === 'agent') {
      const actorAgent = actor.agentId ? await svc.getById(actor.agentId) : null
      if (!actorAgent || actorAgent.companyId !== existing.companyId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (actorAgent.role !== 'ceo') {
        return NextResponse.json({ error: 'Only CEO can manage permissions' }, { status: 403 })
      }
    }

    const body = await parseBody(req, updateAgentPermissionsSchema)
    const agent = await svc.updatePermissions(id, body)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const effectiveCanAssignTasks =
      agent.role === 'ceo' || Boolean(agent.permissions?.canCreateAgents) || body.canAssignTasks

    await access.ensureMembership(agent.companyId, 'agent', agent.id, 'member', 'active')
    await access.setPrincipalPermission(
      agent.companyId,
      'agent',
      agent.id,
      'tasks:assign',
      effectiveCanAssignTasks,
      actor.type === 'board' ? (actor.userId ?? null) : null,
    )

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'agent.permissions_updated',
      entityType: 'agent',
      entityId: agent.id,
      details: {
        canCreateAgents: agent.permissions?.canCreateAgents ?? false,
        canAssignTasks: effectiveCanAssignTasks,
      },
    })

    return NextResponse.json(await buildAgentDetail(svc, agent))
  } catch (err) {
    return handleError(err)
  }
}
