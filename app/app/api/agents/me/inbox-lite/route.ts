import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { issueService } from '@/services/index'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    if (actor.type !== 'agent' || !actor.agentId || !actor.companyId) {
      return NextResponse.json({ error: 'Agent authentication required' }, { status: 401 })
    }
    const issuesSvc = issueService(db)
    const rows = await issuesSvc.list(actor.companyId, {
      assigneeAgentId: actor.agentId,
      status: 'todo,in_progress,blocked',
    })
    return NextResponse.json(
      rows.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        projectId: issue.projectId,
        goalId: issue.goalId,
        parentId: issue.parentId,
        updatedAt: issue.updatedAt,
        activeRun: issue.activeRun,
      })),
    )
  } catch (err) {
    return handleError(err)
  }
}
