import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { db } from '@/lib/db'
import { sprintService, logActivity, projectService } from '@/services/index'

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
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    }
    const project = await resolveProject(existing.projectId)
    assertCompanyAccess(actor, project.companyId)
    const sprint = await svc.activate(id)
    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'sprint.activated',
      entityType: 'sprint',
      entityId: id,
    })
    return NextResponse.json(sprint)
  } catch (err) {
    return handleError(err)
  }
}
