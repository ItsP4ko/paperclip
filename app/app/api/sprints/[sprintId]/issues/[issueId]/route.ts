import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { sprintService, projectService } from '@/services/index'

export const maxDuration = 30

async function resolveProject(projectId: string) {
  const project = await projectService(db).getById(projectId)
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 })
  return project
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sprintId: string; issueId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { sprintId, issueId } = await params
    const svc = sprintService(db)
    const sprint = await svc.getById(sprintId)
    if (!sprint) {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    }
    const project = await resolveProject(sprint.projectId)
    assertCompanyAccess(actor, project.companyId)
    await svc.removeIssue(sprintId, issueId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
