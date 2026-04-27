import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { logActivity, secretService } from '@/services/index'
import { updateSecretSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { id } = await params
    const svc = secretService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)

    const body = await parseBody(req, updateSecretSchema) as {
      name?: string
      description?: string
      externalRef?: string
    }
    const updated = await svc.update(id, {
      name: body.name,
      description: body.description,
      externalRef: body.externalRef,
    })

    if (!updated) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 })
    }

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'secret.updated',
      entityType: 'secret',
      entityId: updated.id,
      details: { name: updated.name },
    })

    return NextResponse.json(updated)
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
    assertBoard(actor)
    const { id } = await params
    const svc = secretService(db)
    const existing = await svc.getById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, existing.companyId)

    const removed = await svc.remove(id)
    if (!removed) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 })
    }

    await logActivity(db, {
      companyId: removed.companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'secret.deleted',
      entityType: 'secret',
      entityId: removed.id,
      details: { name: removed.name },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
