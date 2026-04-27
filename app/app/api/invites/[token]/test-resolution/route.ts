import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { invites } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError, notFound, badRequest } from '@/server/errors'
import { db } from '@/lib/db'
import { hashToken, inviteExpired } from '@/server/access-helpers'

export const maxDuration = 30

type InviteResolutionProbe = {
  status: 'reachable' | 'timeout' | 'unreachable'
  method: 'HEAD'
  durationMs: number
  httpStatus: number | null
  message: string
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

async function probeInviteResolutionTarget(
  url: URL,
  timeoutMs: number,
): Promise<InviteResolutionProbe> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    })
    const durationMs = Date.now() - startedAt
    if (
      response.ok ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 405 ||
      response.status === 422 ||
      response.status === 500 ||
      response.status === 501
    ) {
      return {
        status: 'reachable',
        method: 'HEAD',
        durationMs,
        httpStatus: response.status,
        message: `Webhook endpoint responded to HEAD with HTTP ${response.status}.`,
      }
    }
    return {
      status: 'unreachable',
      method: 'HEAD',
      durationMs,
      httpStatus: response.status,
      message: `Webhook endpoint probe returned HTTP ${response.status}.`,
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    if (isAbortError(error)) {
      return {
        status: 'timeout',
        method: 'HEAD',
        durationMs,
        httpStatus: null,
        message: `Webhook endpoint probe timed out after ${timeoutMs}ms.`,
      }
    }
    return {
      status: 'unreachable',
      method: 'HEAD',
      durationMs,
      httpStatus: null,
      message: error instanceof Error ? error.message : 'Webhook endpoint probe failed.',
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await resolveActor(req)
    const { token } = await params
    const trimmedToken = token.trim()
    if (!trimmedToken) throw notFound('Invite not found')

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(trimmedToken)))
      .then((rows) => rows[0] ?? null)

    if (!invite || invite.revokedAt || inviteExpired(invite)) {
      throw notFound('Invite not found')
    }

    const sp = req.nextUrl.searchParams
    const rawUrl = sp.get('url')?.trim() ?? ''
    if (!rawUrl) throw badRequest('url query parameter is required')

    let target: URL
    try {
      target = new URL(rawUrl)
    } catch {
      throw badRequest('url must be an absolute http(s) URL')
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw badRequest('url must use http or https')
    }

    const parsedTimeoutMs = Number(sp.get('timeoutMs'))
    const timeoutMs = Number.isFinite(parsedTimeoutMs)
      ? Math.max(1000, Math.min(15000, Math.floor(parsedTimeoutMs)))
      : 5000

    const probe = await probeInviteResolutionTarget(target, timeoutMs)

    return NextResponse.json({
      inviteId: invite.id,
      testResolutionPath: `/api/invites/${trimmedToken}/test-resolution`,
      requestedUrl: target.toString(),
      timeoutMs,
      ...probe,
    })
  } catch (err) {
    return handleError(err)
  }
}
