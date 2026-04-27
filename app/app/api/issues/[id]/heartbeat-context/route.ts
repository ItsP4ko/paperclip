import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService, projectService, goalService } from '@/services/index'

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

    const wakeCommentIdRaw = req.nextUrl.searchParams.get('wakeCommentId')
    const wakeCommentId = wakeCommentIdRaw && wakeCommentIdRaw.trim().length > 0 ? wakeCommentIdRaw.trim() : null

    const projectsSvc = projectService(db)
    const goalsSvc = goalService(db)

    const projectPromise = issue.projectId ? projectsSvc.getById(issue.projectId) : Promise.resolve(null)
    const directGoalPromise = issue.goalId ? goalsSvc.getById(issue.goalId) : Promise.resolve(null)
    const [ancestors, commentCursor, wakeComment, project, directGoal] = await Promise.all([
      svc.getAncestors(issue.id),
      svc.getCommentCursor(issue.id),
      wakeCommentId ? svc.getComment(wakeCommentId) : Promise.resolve(null),
      projectPromise,
      directGoalPromise,
    ])

    let goal = directGoal
    if (!goal) {
      const projectGoalId = (project as { goalId?: string | null; goalIds?: string[] } | null)?.goalId
        ?? (project as { goalId?: string | null; goalIds?: string[] } | null)?.goalIds?.[0]
        ?? null
      if (projectGoalId) {
        goal = await goalsSvc.getById(projectGoalId)
      } else if (!issue.projectId) {
        goal = await goalsSvc.getDefaultCompanyGoal(issue.companyId)
      }
    }

    return NextResponse.json({
      issue: {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        projectId: issue.projectId,
        goalId: goal?.id ?? issue.goalId,
        parentId: issue.parentId,
        assigneeAgentId: issue.assigneeAgentId,
        assigneeUserId: issue.assigneeUserId,
        updatedAt: issue.updatedAt,
      },
      ancestors: ancestors.map((ancestor) => ({
        id: ancestor.id,
        identifier: ancestor.identifier,
        title: ancestor.title,
        status: ancestor.status,
        priority: ancestor.priority,
      })),
      project: project
        ? { id: project.id, name: project.name, status: project.status, targetDate: project.targetDate }
        : null,
      goal: goal
        ? { id: goal.id, title: goal.title, status: goal.status, level: goal.level, parentId: goal.parentId }
        : null,
      commentCursor,
      wakeComment: wakeComment && wakeComment.issueId === issue.id ? wakeComment : null,
    })
  } catch (err) {
    return handleError(err)
  }
}
