import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, feedbackService, instanceSettingsService, logActivity } from '@/services/index'
import { upsertIssueFeedbackVoteSchema } from '@paperclipai/shared'
import type { FeedbackTargetType, FeedbackVoteValue } from '@paperclipai/shared'

export const maxDuration = 30

async function normalizeIssueIdentifier(rawId: string): Promise<string> {
  const svc = issueService(db)
  if (/^[A-Z]+-\d+$/i.test(rawId)) {
    const issue = await svc.getByIdentifier(rawId)
    if (issue) return issue.id
  }
  return rawId
}

export async function GET(
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

    if (actor.type !== 'board') {
      return NextResponse.json({ error: 'Only board users can view feedback votes' }, { status: 403 })
    }

    const feedback = feedbackService(db)
    const votes = await feedback.listIssueVotesForUser(id, actor.userId ?? 'local-board')
    return NextResponse.json(votes)
  } catch (err) {
    return handleError(err)
  }
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

    if (actor.type !== 'board') {
      return NextResponse.json({ error: 'Only board users can vote on AI feedback' }, { status: 403 })
    }

    const body = await parseBody(req, upsertIssueFeedbackVoteSchema)
    const actorInfo = getActorInfo(actor)
    const feedback = feedbackService(db)
    const result = await feedback.saveIssueVote({
      issueId: id,
      targetType: (body as Record<string, unknown>).targetType as FeedbackTargetType,
      targetId: (body as Record<string, unknown>).targetId as string,
      vote: (body as Record<string, unknown>).vote as FeedbackVoteValue,
      reason: (body as Record<string, unknown>).reason as string | undefined,
      authorUserId: actor.userId ?? 'local-board',
      allowSharing: (body as Record<string, unknown>).allowSharing === true,
    })

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'issue.feedback_vote_saved',
      entityType: 'issue',
      entityId: issue.id,
      details: {
        identifier: issue.identifier,
        targetType: result.vote.targetType,
        targetId: result.vote.targetId,
        vote: result.vote.vote,
        hasReason: Boolean(result.vote.reason),
        sharingEnabled: result.sharingEnabled,
      },
    })

    if (result.consentEnabledNow) {
      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actorInfo.actorType,
        actorId: actorInfo.actorId,
        agentId: actorInfo.agentId,
        runId: actorInfo.runId,
        action: 'company.feedback_data_sharing_updated',
        entityType: 'company',
        entityId: issue.companyId,
        details: { feedbackDataSharingEnabled: true, source: 'issue_feedback_vote' },
      })
    }

    if (result.persistedSharingPreference) {
      const instanceSettings = instanceSettingsService(db)
      const [settings, companyIds] = await Promise.all([
        instanceSettings.get(),
        instanceSettings.listCompanyIds(),
      ])
      await Promise.all(
        companyIds.map((companyId) =>
          logActivity(db, {
            companyId,
            actorType: actorInfo.actorType,
            actorId: actorInfo.actorId,
            agentId: actorInfo.agentId,
            runId: actorInfo.runId,
            action: 'instance.settings.general_updated',
            entityType: 'instance_settings',
            entityId: settings.id,
            details: {
              general: settings.general,
              changedKeys: ['feedbackDataSharingPreference'],
              source: 'issue_feedback_vote',
            },
          }),
        ),
      )
    }

    return NextResponse.json(result.vote, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
