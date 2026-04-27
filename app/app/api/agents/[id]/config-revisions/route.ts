import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService } from '@/services/index'
import { assertCanReadConfigurations, redactConfigRevision } from '../../_shared'

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
    const revisions = await svc.listConfigRevisions(id)
    return NextResponse.json(revisions.map((revision) => redactConfigRevision(revision)))
  } catch (err) {
    return handleError(err)
  }
}
