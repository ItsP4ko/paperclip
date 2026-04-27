import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { boardAuthService } from '@/services/index'
import { createCliAuthChallengeSchema } from '@paperclipai/shared'

export const maxDuration = 30

function requestBaseUrl(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const proto = forwardedProto?.split(',')[0]?.trim() || 'http'
  const forwardedHost = req.headers.get('x-forwarded-host')
  const host = forwardedHost?.split(',')[0]?.trim() || req.headers.get('host')
  if (!host) return ''
  return `${proto}://${host}`
}

function buildCliAuthApprovalPath(challengeId: string, token: string) {
  return `/cli-auth/${challengeId}?token=${encodeURIComponent(token)}`
}

export async function POST(req: NextRequest) {
  try {
    await resolveActor(req)
    const body = await parseBody(req, createCliAuthChallengeSchema)
    const boardAuth = boardAuthService(db)
    const created = await boardAuth.createCliAuthChallenge({
      ...body,
      requestedAccess: (body.requestedAccess ?? 'board') as 'board' | 'instance_admin_required',
    })
    const approvalPath = buildCliAuthApprovalPath(created.challenge.id, created.challengeSecret)
    const baseUrl = requestBaseUrl(req)
    return NextResponse.json(
      {
        id: created.challenge.id,
        token: created.challengeSecret,
        boardApiToken: created.pendingBoardToken,
        approvalPath,
        approvalUrl: baseUrl ? `${baseUrl}${approvalPath}` : null,
        pollPath: `/cli-auth/challenges/${created.challenge.id}`,
        expiresAt: created.challenge.expiresAt.toISOString(),
        suggestedPollIntervalMs: 1000,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
