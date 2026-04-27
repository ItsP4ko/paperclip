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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { projectId } = await params
    const project = await resolveProject(projectId)
    assertCompanyAccess(actor, project.companyId)
    const svc = sprintService(db)
    const sprint = await svc.getActive(projectId)
    return NextResponse.json(sprint ?? null)
  } catch (err) {
    return handleError(err)
  }
}
