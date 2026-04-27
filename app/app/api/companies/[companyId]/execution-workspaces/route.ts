import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { executionWorkspaceService } from '@/services/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const sp = req.nextUrl.searchParams
    const svc = executionWorkspaceService(db)
    const workspaces = await svc.list(companyId, {
      projectId: sp.get('projectId') ?? undefined,
      projectWorkspaceId: sp.get('projectWorkspaceId') ?? undefined,
      issueId: sp.get('issueId') ?? undefined,
      status: sp.get('status') ?? undefined,
      reuseEligible: sp.get('reuseEligible') === 'true',
    })
    return NextResponse.json(workspaces)
  } catch (err) {
    return handleError(err)
  }
}
