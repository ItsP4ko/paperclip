import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { logActivity, secretService } from '@/services/index'
import { createSecretSchema, SECRET_PROVIDERS, type SecretProvider } from '@paperclipai/shared'

const configuredDefaultProvider = process.env.PAPERCLIP_SECRETS_PROVIDER
const defaultProvider = (
  configuredDefaultProvider && SECRET_PROVIDERS.includes(configuredDefaultProvider as SecretProvider)
    ? configuredDefaultProvider
    : 'local_encrypted'
) as SecretProvider

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = secretService(db)
    const secrets = await svc.list(companyId)
    return NextResponse.json(secrets)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const body = await parseBody(req, createSecretSchema) as {
      name: string
      provider?: string
      value: string
      description?: string
      externalRef?: string
    }
    const svc = secretService(db)
    const created = await svc.create(
      companyId,
      {
        name: body.name,
        provider: (body.provider ?? defaultProvider) as SecretProvider,
        value: body.value,
        description: body.description,
        externalRef: body.externalRef,
      },
      { userId: actor.userId ?? 'board', agentId: null },
    )

    await logActivity(db, {
      companyId,
      actorType: 'user',
      actorId: actor.userId ?? 'board',
      action: 'secret.created',
      entityType: 'secret',
      entityId: created.id,
      details: { name: created.name, provider: created.provider },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
