import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess, getActorInfo } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { projectService, logActivity } from '@/services/index'
import { updateProjectSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = projectService(db)
    const project = await svc.getById(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, project.companyId)

    // Overlay member local folder for board (user) actors
    if (actor.type === 'board' && actor.userId) {
      const memberFolder = await svc.getMemberLocalFolder(id, 'user', actor.userId)
      if (memberFolder) {
        const overlaidProject = {
          ...project,
          codebase: {
            ...project.codebase,
            localFolder: memberFolder.cwd,
            effectiveLocalFolder: memberFolder.cwd,
            origin: 'local_folder' as const,
          },
        }
        return NextResponse.json(overlaidProject)
      }
    }

    return NextResponse.json(project)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = projectService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)

    const rawBody = await parseBody(req, updateProjectSchema) as Record<string, unknown>
    const body = { ...rawBody }
    if (typeof body.archivedAt === 'string') {
      body.archivedAt = new Date(body.archivedAt)
    }
    const project = await svc.update(id, body)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'project.updated',
      entityType: 'project',
      entityId: project.id,
      details: rawBody,
    })

    return NextResponse.json(project)
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
    const { id } = await params
    const svc = projectService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)
    const project = await svc.remove(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const actorInfo = getActorInfo(actor)
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      action: 'project.deleted',
      entityType: 'project',
      entityId: project.id,
    })

    return NextResponse.json(project)
  } catch (err) {
    return handleError(err)
  }
}
