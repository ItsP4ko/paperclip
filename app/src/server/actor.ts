import type { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { agentApiKeys, agents, companyMemberships, instanceUserRoles } from '@paperclipai/db'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export type Actor =
  | { type: 'board'; userId: string; isInstanceAdmin: boolean; source: string; companyIds?: string[]; runId?: string }
  | { type: 'agent'; agentId: string; companyId: string; runId?: string }
  | { type: 'none'; source: string }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function resolveActor(req: NextRequest): Promise<Actor> {
  const deploymentMode = process.env.PAPERCLIP_DEPLOYMENT_MODE ?? 'local_trusted'

  if (deploymentMode === 'local_trusted') {
    return { type: 'board', userId: 'local-board', isInstanceAdmin: true, source: 'local_implicit' }
  }

  const authHeader = req.headers.get('authorization')

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    const hashed = hashToken(token)

    const [keyRow] = await db
      .select({ agentId: agentApiKeys.agentId })
      .from(agentApiKeys)
      .where(and(eq(agentApiKeys.keyHash, hashed), isNull(agentApiKeys.revokedAt)))
      .limit(1)

    if (keyRow) {
      const [agentRow] = await db
        .select({ companyId: agents.companyId })
        .from(agents)
        .where(eq(agents.id, keyRow.agentId))
        .limit(1)

      if (agentRow) {
        const runId = req.headers.get('x-paperclip-run-id') ?? undefined
        return { type: 'agent', agentId: keyRow.agentId, companyId: agentRow.companyId, runId }
      }
    }

    return { type: 'none', source: 'bearer_invalid' }
  }

  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (session?.user?.id) {
      const userId = session.user.id
      const [roleRow, memberships] = await Promise.all([
        db
          .select({ isAdmin: instanceUserRoles.isAdmin })
          .from(instanceUserRoles)
          .where(eq(instanceUserRoles.userId, userId))
          .then((rows) => rows[0] ?? null),
        db
          .select({ companyId: companyMemberships.companyId })
          .from(companyMemberships)
          .where(eq(companyMemberships.userId, userId)),
      ])
      const companyIds = memberships.map((m) => m.companyId)
      const runId = req.headers.get('x-paperclip-run-id') ?? undefined
      return {
        type: 'board',
        userId,
        isInstanceAdmin: roleRow?.isAdmin ?? false,
        source: 'better_auth',
        companyIds,
        runId,
      }
    }
  } catch {
    // no valid session
  }

  return { type: 'none', source: 'none' }
}
