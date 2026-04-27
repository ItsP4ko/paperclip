import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { logActivity, secretService } from '@/services/index'
import { rotateSecretSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function POST(
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

    const body = await parseBody(req, rotateSecretSchema) as {
      value?: string
      externalRef?: string
    }
    const rotated = await svc.rotate(
      id,
      {
        value: body.value ?? '',
        externalRef: body.externalRef,
      },
      { userId: actor.userId ?? 'board', agentId: null },
    )

    await logActivity(db, {
      companyId: rotated.companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'secret.rotated',
      entityType: 'secret',
      entityId: rotated.id,
      details: { version: rotated.latestVersion },
    })

    return NextResponse.json(rotated)
  } catch (err) {
    return handleError(err)
  }
}
