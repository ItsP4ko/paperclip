import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { sprintService, projectService } from '@/services/index'

export const maxDuration = 30

async function resolveProject(id: string) {
  const project = await projectService(db).getById(id)
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 })
  return project
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const project = await resolveProject(id)
    assertCompanyAccess(actor, project.companyId)
    const svc = sprintService(db)
    const sprint = await svc.getActive(id)
    return NextResponse.json(sprint ?? null)
  } catch (err) {
    return handleError(err)
  }
}
