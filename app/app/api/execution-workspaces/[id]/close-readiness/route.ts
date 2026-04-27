import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { executionWorkspaceService } from '@/services/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params

    const svc = executionWorkspaceService(db)
    const workspace = await svc.getById(id)
    if (!workspace) return NextResponse.json({ error: 'Execution workspace not found' }, { status: 404 })
    assertCompanyAccess(actor, workspace.companyId)

    const readiness = await svc.getCloseReadiness(id)
    if (!readiness) return NextResponse.json({ error: 'Execution workspace not found' }, { status: 404 })
    return NextResponse.json(readiness)
  } catch (err) {
    return handleError(err)
  }
}
