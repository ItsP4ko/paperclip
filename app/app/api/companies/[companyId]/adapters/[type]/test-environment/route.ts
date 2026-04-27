import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { secretService } from '@/services/index'
import { findServerAdapter } from '@/adapters/index'
import { testAdapterEnvironmentSchema } from '@paperclipai/shared'
import { assertCanReadConfigurations, STRICT_SECRETS_MODE } from '../../../../../agents/_shared'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; type: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId, type } = await params
    await assertCanReadConfigurations(actor, companyId)

    const adapter = findServerAdapter(type)
    if (!adapter) {
      return NextResponse.json({ error: `Unknown adapter type: ${type}` }, { status: 404 })
    }

    const body = await parseBody(req, testAdapterEnvironmentSchema)
    const secretsSvc = secretService(db)
    const inputAdapterConfig = ((body as Record<string, unknown>).adapterConfig ?? {}) as Record<string, unknown>
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      companyId,
      inputAdapterConfig,
      { strictMode: STRICT_SECRETS_MODE },
    )
    const { config: runtimeAdapterConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
      companyId,
      normalizedAdapterConfig,
    )

    const result = await adapter.testEnvironment({
      companyId,
      adapterType: type,
      config: runtimeAdapterConfig,
    })

    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
