import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { approvalService, issueApprovalService } from '@/services/index'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = approvalService(db)
    const approval = await svc.getById(id)
    if (!approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, approval.companyId)
    const issueApprovalsSvc = issueApprovalService(db)
    const issues = await issueApprovalsSvc.listIssuesForApproval(id)
    return NextResponse.json(issues)
  } catch (err) {
    return handleError(err)
  }
}
