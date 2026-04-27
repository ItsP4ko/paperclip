import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, agentInstructionsService, secretService, logActivity } from '@/services/index'
import { updateAgentInstructionsBundleSchema } from '@paperclipai/shared'
import { assertCanReadAgent, assertCanManageInstructionsPath, STRICT_SECRETS_MODE } from '../../_shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = agentService(db)
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    await assertCanReadAgent(actor, existing)
    const instructions = agentInstructionsService()
    return NextResponse.json(await instructions.getBundle(existing))
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
    const svc = agentService(db)
    const secretsSvc = secretService(db)
    const instructions = agentInstructionsService()
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    await assertCanManageInstructionsPath(actor, existing)

    const body = await parseBody(req, updateAgentInstructionsBundleSchema)
    const actorInfo = getActorInfo(actor)
    const { bundle, adapterConfig } = await instructions.updateBundle(existing, body)
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      adapterConfig,
      { strictMode: STRICT_SECRETS_MODE },
    )
    await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actorInfo.agentId,
          createdByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
          source: 'instructions_bundle_patch',
        },
      },
    )

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'agent.instructions_bundle_updated',
      entityType: 'agent',
      entityId: existing.id,
      details: {
        mode: bundle.mode,
        rootPath: bundle.rootPath,
        entryFile: bundle.entryFile,
        clearLegacyPromptTemplate: body.clearLegacyPromptTemplate === true,
      },
    })

    return NextResponse.json(bundle)
  } catch (err) {
    return handleError(err)
  }
}
