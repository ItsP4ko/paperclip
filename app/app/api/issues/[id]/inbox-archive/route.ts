import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, logActivity } from '@/services/index'

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
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    if (actor.type !== 'board') return NextResponse.json({ error: 'Board authentication required' }, { status: 403 })
    if (!actor.userId) return NextResponse.json({ error: 'Board user context required' }, { status: 403 })

    const archiveState = await svc.archiveInbox(issue.companyId, issue.id, actor.userId, new Date())
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.inbox_archived',
      entityType: 'issue',
      entityId: issue.id,
      details: { userId: actor.userId, archivedAt: archiveState.archivedAt },
    })
    return NextResponse.json(archiveState)
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
    const { id: rawId } = await params
    const id = await normalizeIssueIdentifier(rawId)

    const svc = issueService(db)
    const issue = await svc.getById(id)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    if (actor.type !== 'board') return NextResponse.json({ error: 'Board authentication required' }, { status: 403 })
    if (!actor.userId) return NextResponse.json({ error: 'Board user context required' }, { status: 403 })

    const removed = await svc.unarchiveInbox(issue.companyId, issue.id, actor.userId)
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.inbox_unarchived',
      entityType: 'issue',
      entityId: issue.id,
      details: { userId: actor.userId },
    })
    return NextResponse.json(removed ?? { ok: true })
  } catch (err) {
    return handleError(err)
  }
}
