import type { NextRequest } from 'next/server'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { agentApiKeys, agents, authUsers, boardApiKeys, companyMemberships, instanceUserRoles } from '@paperclipai/db'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export type Actor =
  | { type: 'board'; userId: string; isInstanceAdmin: boolean; source: string; companyIds?: string[]; runId?: string; keyId?: string }
  | { type: 'agent'; agentId: string; companyId: string; runId?: string; keyId?: string; source: string }
  | { type: 'none'; source: string; runId?: string }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

// ---------------------------------------------------------------------------
// Local agent JWT — inlined from server/src/agent-auth-jwt.ts (pure crypto, no Express deps)
// ---------------------------------------------------------------------------

interface LocalAgentJwtClaims {
  sub: string
  company_id: string
  adapter_type: string
  run_id: string
  iat: number
  exp: number
  iss?: string
  aud?: string
  jti?: string
}

const JWT_ALGORITHM = 'HS256'

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function jwtConfig() {
  const secret = process.env.PAPERCLIP_AGENT_JWT_SECRET
  if (!secret) return null
  return {
    secret,
    ttlSeconds: parseNumber(process.env.PAPERCLIP_AGENT_JWT_TTL_SECONDS, 60 * 60 * 48),
    issuer: process.env.PAPERCLIP_AGENT_JWT_ISSUER ?? 'paperclip',
    audience: process.env.PAPERCLIP_AGENT_JWT_AUDIENCE ?? 'paperclip-api',
  }
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function verifyLocalAgentJwt(token: string): LocalAgentJwtClaims | null {
  if (!token) return null
  const config = jwtConfig()
  if (!config) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, claimsB64, signature] = parts

  const header = parseJson(Buffer.from(headerB64, 'base64url').toString('utf8'))
  if (!header || header.alg !== JWT_ALGORITHM) return null

  const signingInput = `${headerB64}.${claimsB64}`
  const expectedSig = createHmac('sha256', config.secret).update(signingInput).digest('base64url')
  if (!safeCompare(signature, expectedSig)) return null

  const claims = parseJson(Buffer.from(claimsB64, 'base64url').toString('utf8'))
  if (!claims) return null

  const sub = typeof claims.sub === 'string' ? claims.sub : null
  const companyId = typeof claims.company_id === 'string' ? claims.company_id : null
  const adapterType = typeof claims.adapter_type === 'string' ? claims.adapter_type : null
  const runId = typeof claims.run_id === 'string' ? claims.run_id : null
  const iat = typeof claims.iat === 'number' ? claims.iat : null
  const exp = typeof claims.exp === 'number' ? claims.exp : null
  if (!sub || !companyId || !adapterType || !runId || !iat || !exp) return null

  const now = Math.floor(Date.now() / 1000)
  if (exp < now) return null

  const issuer = typeof claims.iss === 'string' ? claims.iss : undefined
  const audience = typeof claims.aud === 'string' ? claims.aud : undefined
  if (issuer && issuer !== config.issuer) return null
  if (audience && audience !== config.audience) return null

  return {
    sub,
    company_id: companyId,
    adapter_type: adapterType,
    run_id: runId,
    iat,
    exp,
    ...(issuer ? { iss: issuer } : {}),
    ...(audience ? { aud: audience } : {}),
    jti: typeof claims.jti === 'string' ? claims.jti : undefined,
  }
}

// ---------------------------------------------------------------------------
// Session resolution — shared by cookie and bearer-session paths
// ---------------------------------------------------------------------------

async function resolveSessionActor(
  req: NextRequest,
  runId: string | undefined,
  source: string,
): Promise<Actor | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session?.user?.id) return null
    const userId = session.user.id
    const [roleRow, memberships] = await Promise.all([
      db
        .select({ id: instanceUserRoles.id })
        .from(instanceUserRoles)
        .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, 'instance_admin')))
        .then((rows) => rows[0] ?? null),
      db
        .select({ companyId: companyMemberships.companyId })
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.principalType, 'user'),
            eq(companyMemberships.principalId, userId),
            eq(companyMemberships.status, 'active'),
          ),
        ),
    ])
    return {
      type: 'board',
      userId,
      companyIds: memberships.map((m) => m.companyId),
      isInstanceAdmin: Boolean(roleRow),
      runId,
      source,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function resolveActor(req: NextRequest): Promise<Actor> {
  const deploymentMode = process.env.PAPERCLIP_DEPLOYMENT_MODE ?? 'local_trusted'

  if (deploymentMode === 'local_trusted') {
    return { type: 'board', userId: 'local-board', isInstanceAdmin: true, source: 'local_implicit' }
  }

  const runId = req.headers.get('x-paperclip-run-id') ?? undefined
  const authHeader = req.headers.get('authorization')

  // No bearer header — try cookie session
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    const sessionActor = await resolveSessionActor(req, runId, 'session')
    if (sessionActor) return sessionActor
    return { type: 'none', source: 'none', ...(runId ? { runId } : {}) }
  }

  const token = authHeader.slice('bearer '.length).trim()
  if (!token) return { type: 'none', source: 'none' }

  // 1. Try better-auth bearer session (bearer plugin converts Bearer <signed_token> → session)
  const bearerSessionActor = await resolveSessionActor(req, runId, 'bearer_session')
  if (bearerSessionActor) return bearerSessionActor

  // 2. Try board API key
  const tokenHash = hashToken(token)
  const now = new Date()
  const boardKey = await db
    .select({
      id: boardApiKeys.id,
      userId: boardApiKeys.userId,
      expiresAt: boardApiKeys.expiresAt,
      revokedAt: boardApiKeys.revokedAt,
    })
    .from(boardApiKeys)
    .where(and(eq(boardApiKeys.keyHash, tokenHash), isNull(boardApiKeys.revokedAt)))
    .then((rows) => rows.find((row) => !row.expiresAt || row.expiresAt.getTime() > now.getTime()) ?? null)

  if (boardKey) {
    const userId = boardKey.userId
    const [user, roleRow, memberships] = await Promise.all([
      db
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(eq(authUsers.id, userId))
        .then((r) => r[0] ?? null),
      db
        .select({ id: instanceUserRoles.id })
        .from(instanceUserRoles)
        .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, 'instance_admin')))
        .then((r) => r[0] ?? null),
      db
        .select({ companyId: companyMemberships.companyId })
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.principalType, 'user'),
            eq(companyMemberships.principalId, userId),
            eq(companyMemberships.status, 'active'),
          ),
        ),
    ])
    if (user) {
      // Touch lastUsedAt (fire-and-forget — don't block the response)
      void db.update(boardApiKeys).set({ lastUsedAt: new Date() }).where(eq(boardApiKeys.id, boardKey.id))
      return {
        type: 'board',
        userId,
        companyIds: memberships.map((m) => m.companyId),
        isInstanceAdmin: Boolean(roleRow),
        keyId: boardKey.id,
        runId,
        source: 'board_key',
      }
    }
  }

  // 3. Try agent API key
  const agentKey = await db
    .select()
    .from(agentApiKeys)
    .where(and(eq(agentApiKeys.keyHash, tokenHash), isNull(agentApiKeys.revokedAt)))
    .then((rows) => rows[0] ?? null)

  if (agentKey) {
    const agentRecord = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentKey.agentId))
      .then((rows) => rows[0] ?? null)

    if (agentRecord && agentRecord.status !== 'terminated' && agentRecord.status !== 'pending_approval') {
      // Touch lastUsedAt (fire-and-forget)
      void db.update(agentApiKeys).set({ lastUsedAt: new Date() }).where(eq(agentApiKeys.id, agentKey.id))
      return {
        type: 'agent',
        agentId: agentKey.agentId,
        companyId: agentKey.companyId,
        keyId: agentKey.id,
        runId,
        source: 'agent_key',
      }
    }
    // Key found but agent is terminated/pending_approval or missing
    return { type: 'none', source: 'bearer_invalid' }
  }

  // 4. Try local agent JWT
  const claims = verifyLocalAgentJwt(token)
  if (claims) {
    const agentRecord = await db
      .select()
      .from(agents)
      .where(eq(agents.id, claims.sub))
      .then((rows) => rows[0] ?? null)

    if (
      agentRecord &&
      agentRecord.companyId === claims.company_id &&
      agentRecord.status !== 'terminated' &&
      agentRecord.status !== 'pending_approval'
    ) {
      return {
        type: 'agent',
        agentId: claims.sub,
        companyId: claims.company_id,
        runId: runId ?? claims.run_id,
        source: 'agent_jwt',
      }
    }
  }

  return { type: 'none', source: 'bearer_invalid' }
}
