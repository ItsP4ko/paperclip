import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, heartbeatService, logActivity } from '@/services/index'

export const maxDuration = 30

async function normalizeIssueIdentifier(rawId: string): Promise<string> {
  const svc = issueService(db)
  if (/^[A-Z]+-\d+$/i.test(rawId)) {
    const issue = await svc.getByIdentifier(rawId)
    if (issue) return issue.id
  }
  return rawId
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const heartbeat = heartbeatService(db)

    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, existing.companyId)

    // assertAgentRunCheckoutOwnership
    if (actor.type === 'agent') {
      const actorAgentId = actor.agentId
      if (!actorAgentId) {
        return NextResponse.json({ error: 'Agent authentication required' }, { status: 403 })
      }
      if (existing.status === 'in_progress' && existing.assigneeAgentId === actorAgentId) {
        const runId = actor.runId?.trim()
        if (!runId) {
          return NextResponse.json({ error: 'Agent run id required' }, { status: 401 })
        }
        await svc.assertCheckoutOwner(existing.id, actorAgentId, runId)
      }
    }

    const actorRunId = actor.type === 'agent' ? actor.runId?.trim() ?? null : null
    if (actor.type === 'agent' && !actorRunId) {
      return NextResponse.json({ error: 'Agent run id required' }, { status: 401 })
    }

    const released = await svc.release(
      id,
      actor.type === 'agent' ? actor.agentId : undefined,
      actorRunId,
    )
    if (!released) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: released.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.released',
      entityType: 'issue',
      entityId: released.id,
    })

    return NextResponse.json(released)
  } catch (err) {
    return handleError(err)
  }
}
