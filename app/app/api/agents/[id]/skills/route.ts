import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { getActorInfo } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService, companySkillService, secretService, logActivity } from '@/services/index'
import { agentSkillSyncSchema } from '@paperclipai/shared'
import { findServerAdapter } from '@/adapters/index'
import { readPaperclipSkillSyncPreference } from '@paperclipai/adapter-utils/server-utils'
import {
  assertCanReadConfigurations,
  buildUnsupportedSkillSnapshot,
  buildRuntimeSkillConfig,
} from '../../_shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = agentService(db)
    const agent = await svc.getById(id)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    await assertCanReadConfigurations(actor, agent.companyId)

    const adapter = findServerAdapter(agent.adapterType)
    if (!adapter?.listSkills) {
      const preference = readPaperclipSkillSyncPreference(agent.adapterConfig as Record<string, unknown>)
      const companySkills = companySkillService(db)
      const runtimeSkillEntries = await companySkills.listRuntimeSkillEntries(agent.companyId, {
        materializeMissing: false,
      })
      const requiredSkills = runtimeSkillEntries.filter((e) => e.required).map((e) => e.key)
      return NextResponse.json(
        buildUnsupportedSkillSnapshot(
          agent.adapterType,
          Array.from(new Set([...requiredSkills, ...preference.desiredSkills])),
        ),
      )
    }

    const secretsSvc = secretService(db)
    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
      agent.companyId,
      agent.adapterConfig,
    )
    const runtimeSkillConfig = await buildRuntimeSkillConfig(agent.companyId, agent.adapterType, runtimeConfig)
    const snapshot = await adapter.listSkills({
      agentId: agent.id,
      companyId: agent.companyId,
      adapterType: agent.adapterType,
      config: runtimeSkillConfig,
    })
    return NextResponse.json(snapshot)
  } catch (err) {
    return handleError(err)
  }
}
