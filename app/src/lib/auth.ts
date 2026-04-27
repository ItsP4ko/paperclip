import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'
import { authAccounts, authSessions, authUsers, authVerifications } from '@paperclipai/db'
import { db } from '@/lib/db'

function getTrustedOrigins(): string[] {
  const origins = new Set<string>()
  const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (baseUrl) {
    try { origins.add(new URL(baseUrl).origin) } catch {}
  }
  const allowed = (process.env.PAPERCLIP_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)
  for (const o of allowed) origins.add(o.trim())
  return Array.from(origins)
}

const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const secret = process.env.BETTER_AUTH_SECRET?.trim() ?? process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim()
if (!secret) throw new Error('BETTER_AUTH_SECRET must be set')

const isHttpOnly = baseUrl.startsWith('http://')

export const auth = betterAuth({
  baseURL: baseUrl,
  secret,
  trustedOrigins: getTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: authUsers,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [bearer()],
  ...(isHttpOnly
    ? {}
    : {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }),
})
