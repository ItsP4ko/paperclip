import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, secretService, logActivity } from '@/services/index'
import { agentSkillSyncSchema } from '@paperclipai/shared'
import { findServerAdapter } from '@/adapters/index'
import {
  assertCanUpdateAgent,
  buildUnsupportedSkillSnapshot,
  resolveDesiredSkillAssignment,
} from '../../../_shared'
import { unprocessable } from '@/server/errors'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = agentService(db)
    const secretsSvc = secretService(db)
    const agent = await svc.getById(id)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    await assertCanUpdateAgent(actor, agent)

    const body = await parseBody(req, agentSkillSyncSchema)
    const requestedSkills = Array.from(
      new Set(
        (body.desiredSkills as string[]).map((v) => v.trim()).filter(Boolean),
      ),
    )

    const {
      adapterConfig: nextAdapterConfig,
      desiredSkills,
      runtimeSkillEntries,
    } = await resolveDesiredSkillAssignment(
      agent.companyId,
      agent.adapterType,
      agent.adapterConfig as Record<string, unknown>,
      requestedSkills,
    )

    if (!desiredSkills || !runtimeSkillEntries) {
      throw unprocessable('Skill sync requires desiredSkills.')
    }

    const actorInfo = getActorInfo(actor)
    const updated = await svc.update(
      agent.id,
      { adapterConfig: nextAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actorInfo.agentId,
          createdByUserId: actorInfo.actorType === 'user' ? actorInfo.actorId : null,
          source: 'skill-sync',
        },
      },
    )
    if (!updated) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const adapter = findServerAdapter(updated.adapterType)
    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
      updated.companyId,
      updated.adapterConfig,
    )
    const runtimeSkillConfig = { ...runtimeConfig, paperclipRuntimeSkills: runtimeSkillEntries }

    const snapshot = adapter?.syncSkills
      ? await adapter.syncSkills(
          {
            agentId: updated.id,
            companyId: updated.companyId,
            adapterType: updated.adapterType,
            config: runtimeSkillConfig,
          },
          desiredSkills,
        )
      : adapter?.listSkills
        ? await adapter.listSkills({
            agentId: updated.id,
            companyId: updated.companyId,
            adapterType: updated.adapterType,
            config: runtimeSkillConfig,
          })
        : buildUnsupportedSkillSnapshot(updated.adapterType, desiredSkills)

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: actorInfo.actorType,
      actorId: actorInfo.actorId,
      action: 'agent.skills_synced',
      entityType: 'agent',
      entityId: updated.id,
      agentId: actorInfo.agentId,
      runId: actorInfo.runId,
      details: {
        adapterType: updated.adapterType,
        desiredSkills,
        mode: snapshot.mode,
        supported: snapshot.supported,
        entryCount: snapshot.entries.length,
        warningCount: snapshot.warnings.length,
      },
    })

    return NextResponse.json(snapshot)
  } catch (err) {
    return handleError(err)
  }
}
