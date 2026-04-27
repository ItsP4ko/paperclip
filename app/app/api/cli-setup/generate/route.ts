import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { authUsers, boardApiKeys } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError, unauthorized } from '@/server/errors'
import { db } from '@/lib/db'
import { createBoardApiToken, hashBearerToken, boardApiKeyExpiresAt } from '@/services/board-auth'

export const maxDuration = 30

function requestBaseUrl(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const proto = forwardedProto?.split(',')[0]?.trim() || 'http'
  const forwardedHost = req.headers.get('x-forwarded-host')
  const host = forwardedHost?.split(',')[0]?.trim() || req.headers.get('host')
  if (!host) return ''
  return `${proto}://${host}`
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    if (actor.type !== 'board' || !actor.userId) {
      throw unauthorized('Authenticated session required')
    }

    const userId = actor.userId
    const plainToken = createBoardApiToken()
    const keyHash = hashBearerToken(plainToken)
    const expiresAt = boardApiKeyExpiresAt()

    await db.insert(boardApiKeys).values({
      userId,
      name: 'CLI Setup (auto-generated)',
      keyHash,
      expiresAt,
    })

    const user = await db
      .select({ email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null)

    const serverUrl = process.env.PAPERCLIP_PUBLIC_URL || requestBaseUrl(req) || null

    return NextResponse.json(
      {
        token: plainToken,
        serverUrl,
        expiresAt: expiresAt.toISOString(),
        userEmail: user?.email ?? null,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
