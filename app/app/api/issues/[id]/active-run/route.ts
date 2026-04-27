import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService, heartbeatService, issueService } from '@/services/index'
import { getCurrentUserRedactionOptions, redactCurrentUserValue, asRecord, asNonEmptyString } from '../../../agents/_shared'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id: rawId } = await params
    const issueSvc = issueService(db)
    const isIdentifier = /^[A-Z]+-\d+$/i.test(rawId)
    const issue = isIdentifier ? await issueSvc.getByIdentifier(rawId) : await issueSvc.getById(rawId)
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    const heartbeat = heartbeatService(db)
    let run = issue.executionRunId ? await heartbeat.getRun(issue.executionRunId) : null
    if (run && run.status !== 'queued' && run.status !== 'running') {
      run = null
    }

    if (!run && issue.assigneeAgentId && issue.status === 'in_progress') {
      const candidateRun = await heartbeat.getActiveRunForAgent(issue.assigneeAgentId)
      const candidateContext = asRecord(candidateRun?.contextSnapshot)
      const candidateIssueId = asNonEmptyString(candidateContext?.issueId)
      if (candidateRun && candidateIssueId === issue.id) {
        run = candidateRun
      }
    }

    if (!run) return NextResponse.json(null)

    const svc = agentService(db)
    const agent = await svc.getById(run.agentId)
    if (!agent) return NextResponse.json(null)

    const currentUserRedactionOptions = await getCurrentUserRedactionOptions()
    return NextResponse.json({
      ...redactCurrentUserValue(run, currentUserRedactionOptions),
      agentId: agent.id,
      agentName: agent.name,
      adapterType: agent.adapterType,
    })
  } catch (err) {
    return handleError(err)
  }
}
