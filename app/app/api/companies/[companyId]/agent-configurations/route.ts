import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService } from '@/services/index'
import { assertCanReadConfigurations, redactAgentConfiguration } from '../../../agents/_shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    await assertCanReadConfigurations(actor, companyId)
    const svc = agentService(db)
    const rows = await svc.list(companyId)
    return NextResponse.json(rows.map((row) => redactAgentConfiguration(row)))
  } catch (err) {
    return handleError(err)
  }
}
