import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, agentInstructionsService, secretService, logActivity } from '@/services/index'
import { upsertAgentInstructionsFileSchema } from '@paperclipai/shared'
import { assertCanReadAgent, assertCanManageInstructionsPath, STRICT_SECRETS_MODE } from '../../../_shared'

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

    const relativePath = req.nextUrl.searchParams.get('path') ?? ''
    if (!relativePath.trim()) {
      return NextResponse.json({ error: "Query parameter 'path' is required" }, { status: 422 })
    }

    const instructions = agentInstructionsService()
    return NextResponse.json(await instructions.readFile(existing, relativePath))
  } catch (err) {
    return handleError(err)
  }
}

export async function PUT(
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

    const body = await parseBody(req, upsertAgentInstructionsFileSchema)
    const actorInfo = getActorInfo(actor)
    const result = await instructions.writeFile(existing, body.path, body.content, {
      clearLegacyPromptTemplate: body.clearLegacyPromptTemplate,
    })
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      result.adapterConfig,
      { strictMode: STRICT_SECRETS_MODE },
    )
    await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actorInfo.agentId,
          createdByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
          source: 'instructions_bundle_file_put',
        },
      },
    )

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'agent.instructions_file_updated',
      entityType: 'agent',
      entityId: existing.id,
      details: {
        path: result.file.path,
        size: result.file.size,
        clearLegacyPromptTemplate: body.clearLegacyPromptTemplate === true,
      },
    })

    return NextResponse.json(result.file)
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
    const svc = agentService(db)
    const instructions = agentInstructionsService()
    const existing = await svc.getById(id)
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    await assertCanManageInstructionsPath(actor, existing)

    const relativePath = req.nextUrl.searchParams.get('path') ?? ''
    if (!relativePath.trim()) {
      return NextResponse.json({ error: "Query parameter 'path' is required" }, { status: 422 })
    }

    const actorInfo = getActorInfo(actor)
    const result = await instructions.deleteFile(existing, relativePath)
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      action: 'agent.instructions_file_deleted',
      entityType: 'agent',
      entityId: existing.id,
      details: { path: relativePath },
    })

    return NextResponse.json(result.bundle)
  } catch (err) {
    return handleError(err)
  }
}
