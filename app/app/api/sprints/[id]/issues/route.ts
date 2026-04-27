import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { sprintService, projectService } from '@/services/index'
import { addIssueToSprintSchema } from '@paperclipai/shared'

export const maxDuration = 30

async function resolveProject(projectId: string) {
  const project = await projectService(db).getById(projectId)
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 })
  return project
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = sprintService(db)
    const sprint = await svc.getById(id)
    if (!sprint) {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    }
    const project = await resolveProject(sprint.projectId)
    assertCompanyAccess(actor, project.companyId)
    const body = await parseBody(req, addIssueToSprintSchema) as { issueId: string }
    const issue = await svc.addIssue(id, body.issueId)
    return NextResponse.json(issue)
  } catch (err) {
    return handleError(err)
  }
}
