# Next.js 16 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Paperclip Express.js backend + Vite React frontend into a single Next.js 16.2.3+ app deployable on Vercel, keeping the React SPA as-is.

**Architecture:** Create a new `app/` package with Next.js 16.2.3. Express route modules become Next.js Route Handlers. The Vite React SPA is moved to `app/src/ui/` and served via a catch-all Next.js page as a client component — no SSR, no React Router changes. Services and DB schema packages remain unchanged.

**Tech Stack:** Next.js 16.2.3, React 19, Drizzle ORM, Supabase (Postgres), better-auth, Redis (VPS), Tailwind CSS 4, TypeScript, pnpm workspaces, Vercel

**Spec:** `docs/superpowers/specs/2026-04-27-nextjs-migration-design.md`

**Pre-requisite:** Branch `feature/remove-plugin-system` must be merged to `developer` before starting this migration.

---

## File Map

```
app/                                         ← new Next.js package
├── app/
│   ├── layout.tsx                           ← root layout (HTML shell + Tailwind CSS)
│   ├── api/
│   │   ├── auth/[...all]/route.ts           ← better-auth handler
│   │   ├── health/route.ts
│   │   ├── llms/route.ts
│   │   ├── companies/route.ts
│   │   ├── companies/[id]/route.ts
│   │   ├── company-skills/route.ts
│   │   ├── agents/route.ts
│   │   ├── agents/[id]/route.ts
│   │   ├── projects/route.ts
│   │   ├── projects/[id]/route.ts
│   │   ├── goals/route.ts
│   │   ├── goals/[id]/route.ts
│   │   ├── issues/route.ts
│   │   ├── issues/[id]/route.ts
│   │   ├── sprints/route.ts
│   │   ├── sprints/[id]/route.ts
│   │   ├── groups/route.ts
│   │   ├── groups/[id]/route.ts
│   │   ├── pipelines/route.ts
│   │   ├── pipelines/[id]/route.ts
│   │   ├── activity/route.ts
│   │   ├── analytics/route.ts
│   │   ├── audit/route.ts
│   │   ├── dashboard/route.ts
│   │   ├── sidebar-badges/route.ts
│   │   ├── costs/route.ts
│   │   ├── cost-recommendations/route.ts
│   │   ├── knowledge/route.ts
│   │   ├── search/route.ts
│   │   ├── access/route.ts
│   │   ├── instance-settings/route.ts
│   │   ├── approvals/route.ts
│   │   ├── approvals/[id]/route.ts
│   │   ├── routines/route.ts
│   │   ├── routines/[id]/route.ts
│   │   ├── secrets/route.ts
│   │   ├── assets/route.ts
│   │   ├── execution-workspaces/route.ts
│   │   ├── runner/route.ts
│   │   ├── remote-control/route.ts
│   │   ├── gemini-analysis/route.ts
│   │   ├── org-chart-svg/route.ts
│   │   ├── issues-checkout-wakeup/route.ts
│   │   └── events/route.ts                  ← SSE (replaces WebSocket)
│   └── [[...slug]]/page.tsx                 ← catch-all: serves React SPA
├── src/
│   ├── lib/
│   │   ├── db.ts                            ← Drizzle + Supabase singleton
│   │   ├── redis.ts                         ← Redis client singleton
│   │   ├── auth.ts                          ← better-auth instance
│   │   └── storage.ts                       ← storage service factory
│   ├── server/
│   │   ├── actor.ts                         ← resolveActor(req) + Actor type
│   │   ├── authz.ts                         ← assertBoard, assertCompanyAccess, etc.
│   │   ├── errors.ts                        ← HttpError + handleError(err)
│   │   └── validate.ts                      ← parseBody(req, schema), parseQuery(req, schema)
│   ├── services/                            ← copied from server/src/services/ (unchanged)
│   └── ui/                                  ← copied from ui/src/ (unchanged)
├── middleware.ts                            ← CORS + rate limiting
├── next.config.ts
├── tailwind.config.ts                       ← reuses ui/tailwind config
├── tsconfig.json
└── package.json
```

---

## Task 1: Create Next.js 16 app package

**Files:**
- Create: `app/package.json`
- Create: `app/next.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/tailwind.config.ts`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Add `app` to pnpm workspace**

Edit `pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - packages/adapters/*
  - server
  - ui
  - cli
  - app
```

- [ ] **Step 2: Create `app/package.json`**

```json
{
  "name": "@paperclipai/app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@paperclipai/db": "workspace:*",
    "@paperclipai/shared": "workspace:*",
    "better-auth": "1.4.18",
    "drizzle-orm": "^0.38.4",
    "postgres": "^3.4.5",
    "redis": "^5.11.0",
    "next": "^16.2.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.2",
    "@aws-sdk/client-s3": "^3.888.0",
    "@supabase/storage-js": "^2.7.1",
    "sharp": "^0.34.5",
    "mammoth": "^1.8.0",
    "pino": "^9.6.0",
    "express-rate-limit": "^8.3.2",
    "rate-limit-redis": "^4.3.1"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.19",
    "@types/node": "^24.6.0",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "tailwindcss": "^4.0.7",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 3: Create `app/next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  // Allow large JSON payloads (company import/export)
  serverExternalPackages: ['sharp', 'mammoth'],
}

export default config
```

- [ ] **Step 4: Create `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create `app/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  plugins: [typography],
}

export default config
```

- [ ] **Step 6: Create `app/app/` directory structure**

```bash
mkdir -p app/app/api
mkdir -p app/src/lib
mkdir -p app/src/server
mkdir -p app/src/services
mkdir -p app/src/ui
```

- [ ] **Step 7: Install dependencies**

```bash
cd app && pnpm install
```

Expected: no errors, `node_modules` created under `app/`.

- [ ] **Step 8: Commit**

```bash
git add app/ pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: scaffold Next.js 16 app package"
```

---

## Task 2: Core lib — DB, Redis, Storage

**Files:**
- Create: `app/src/lib/db.ts`
- Create: `app/src/lib/redis.ts`
- Create: `app/src/lib/storage.ts`

- [ ] **Step 1: Create `app/src/lib/db.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@paperclipai/db'

// In serverless environments, use a connection string with pgBouncer pooling.
// Set DATABASE_URL to your Supabase pooler URL (port 6543, ?pgbouncer=true).
const client = postgres(process.env.DATABASE_URL!, {
  max: 1,            // serverless: one connection per function instance
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })
export type Db = typeof db
```

- [ ] **Step 2: Create `app/src/lib/redis.ts`**

```typescript
import { createClient } from 'redis'

let _redis: ReturnType<typeof createClient> | null = null

export async function getRedis() {
  if (!_redis) {
    _redis = createClient({ url: process.env.REDIS_URL })
    _redis.on('error', (err) => console.error('[redis]', err))
    await _redis.connect()
  }
  return _redis
}
```

- [ ] **Step 3: Create `app/src/lib/storage.ts`**

Copy `server/src/storage/` directory to `app/src/storage/` (all files unchanged):

```bash
cp -r server/src/storage app/src/storage
```

Then create `app/src/lib/storage.ts`:

```typescript
export { createStorageService } from '@/storage/factory'
export type { StorageService } from '@/storage/types'
```

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/ app/src/storage/
git commit -m "feat: add db, redis, storage lib singletons"
```

---

## Task 3: Server helpers — errors, actor, authz, validate

**Files:**
- Create: `app/src/server/errors.ts`
- Create: `app/src/server/actor.ts`
- Create: `app/src/server/authz.ts`
- Create: `app/src/server/validate.ts`

These files mirror the Express versions but are adapted for Next.js (no `req.actor`, no Express types).

- [ ] **Step 1: Create `app/src/server/errors.ts`**

Copy `server/src/errors.ts` to `app/src/server/errors.ts` and add `handleError`:

```typescript
import { NextResponse } from 'next/server'

export class HttpError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function badRequest(message: string, details?: unknown) {
  return new HttpError(400, message, details)
}

export function unauthorized(message = 'Unauthorized') {
  return new HttpError(401, message)
}

export function forbidden(message = 'Forbidden') {
  return new HttpError(403, message)
}

export function notFound(message = 'Not found') {
  return new HttpError(404, message)
}

export function conflict(message: string, details?: unknown) {
  return new HttpError(409, message, details)
}

export function unprocessable(message: string, details?: unknown) {
  return new HttpError(422, message, details)
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message, ...(err.details ? { details: err.details } : {}) },
      { status: err.status }
    )
  }
  console.error('[api]', err)
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
}
```

- [ ] **Step 2: Create `app/src/server/actor.ts`**

This replaces `server/src/middleware/auth.ts`. Instead of Express middleware, it's a standalone async function:

```typescript
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

    // Agent API key check
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

  // Session-based auth (better-auth)
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
```

- [ ] **Step 3: Create `app/src/server/authz.ts`**

```typescript
import type { Actor } from './actor'
import { forbidden, unauthorized } from './errors'

export function assertBoard(actor: Actor): asserts actor is Extract<Actor, { type: 'board' }> {
  if (actor.type !== 'board') throw forbidden('Board access required')
}

export function assertInstanceAdmin(actor: Actor): asserts actor is Extract<Actor, { type: 'board' }> {
  assertBoard(actor)
  if (!actor.isInstanceAdmin && actor.source !== 'local_implicit') {
    throw forbidden('Instance admin access required')
  }
}

export function assertCompanyAccess(actor: Actor, companyId: string) {
  if (actor.type === 'none') throw unauthorized()
  if (actor.type === 'agent' && actor.companyId !== companyId) {
    throw forbidden('Agent key cannot access another company')
  }
  if (actor.type === 'board' && actor.source !== 'local_implicit' && !actor.isInstanceAdmin) {
    const allowed = actor.companyIds ?? []
    if (!allowed.includes(companyId)) throw forbidden('User does not have access to this company')
  }
}

export function getActorInfo(actor: Actor) {
  if (actor.type === 'none') throw unauthorized()
  if (actor.type === 'agent') {
    return {
      actorType: 'agent' as const,
      actorId: actor.agentId,
      agentId: actor.agentId,
      runId: actor.runId ?? null,
    }
  }
  return {
    actorType: 'user' as const,
    actorId: actor.userId,
    agentId: null,
    runId: actor.runId ?? null,
  }
}
```

- [ ] **Step 4: Create `app/src/server/validate.ts`**

```typescript
import type { NextRequest } from 'next/server'
import type { ZodSchema, ZodError } from 'zod'
import { badRequest } from './errors'

export async function parseBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw badRequest('Invalid JSON body')
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw badRequest('Validation error', formatZodError(result.error))
  return result.data
}

export function parseQuery<T>(req: NextRequest, schema: ZodSchema<T>): T {
  const params = Object.fromEntries(req.nextUrl.searchParams)
  const result = schema.safeParse(params)
  if (!result.success) throw badRequest('Invalid query params', formatZodError(result.error))
  return result.data
}

function formatZodError(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}
```

- [ ] **Step 5: Commit**

```bash
git add app/src/server/
git commit -m "feat: add server helpers (errors, actor, authz, validate)"
```

---

## Task 4: better-auth setup

**Files:**
- Create: `app/src/lib/auth.ts`
- Create: `app/app/api/auth/[...all]/route.ts`

- [ ] **Step 1: Create `app/src/lib/auth.ts`**

Look at `server/src/auth/better-auth.ts` for the current config and replicate it using the Next.js adapter. The key differences: use `toNextJsHandler` instead of `toNodeHandler`, use the singleton `db`.

```typescript
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'
import { db } from '@/lib/db'
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
} from '@paperclipai/db'

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: authUsers,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),
  plugins: [bearer()],
  emailAndPassword: {
    enabled: true,
  },
})
```

- [ ] **Step 2: Create `app/app/api/auth/[...all]/route.ts`**

```typescript
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
```

- [ ] **Step 3: Verify better-auth types**

```bash
cd app && pnpm typecheck 2>&1 | grep -i "auth" | head -20
```

Expected: no auth-related type errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/auth.ts app/app/api/auth/
git commit -m "feat: add better-auth Next.js integration"
```

---

## Task 5: Next.js middleware (CORS + rate limiting)

**Files:**
- Create: `app/middleware.ts`

- [ ] **Step 1: Create `app/middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_ORIGINS = (process.env.PAPERCLIP_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    !origin ||
    origin === 'null' ||
    (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) ||
    (origin && ALLOWED_ORIGINS.includes(origin))

  if (!allowed) return {}

  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-paperclip-run-id',
    'Access-Control-Expose-Headers': 'set-auth-token',
  }
}

export async function middleware(req: NextRequest) {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: cors })
  }

  const res = NextResponse.next()
  Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

export const config = {
  matcher: '/api/:path*',
}
```

- [ ] **Step 2: Commit**

```bash
git add app/middleware.ts
git commit -m "feat: add Next.js middleware with CORS"
```

---

## Task 6: Move services and UI source

**Files:**
- Create: `app/src/services/` (copy from `server/src/services/`)
- Create: `app/src/ui/` (copy from `ui/src/`)

- [ ] **Step 1: Copy service layer**

```bash
cp -r server/src/services app/src/services
```

The services use relative imports like `../errors.js` and `../services/index.js`. Update those to `@/server/errors` and `@/services/index` by running a find-replace:

```bash
cd app/src/services
# Fix relative imports from server root
find . -name "*.ts" -exec sed -i '' 's|from "\.\./errors\.js"|from "@/server/errors"|g' {} +
find . -name "*.ts" -exec sed -i '' 's|from "\.\./middleware/logger\.js"|from "@/server/logger"|g' {} +
```

Then create `app/src/server/logger.ts`:

```typescript
import pino from 'pino'
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
```

- [ ] **Step 2: Copy UI source**

```bash
cp -r ui/src app/src/ui
```

The UI has its own `tsconfig.json` paths (`@/*` → `src/*`). In the new app, UI files live at `app/src/ui/`. Update imports inside UI files from `@/` to `@/ui/`:

```bash
cd app/src/ui
find . -name "*.ts" -name "*.tsx" -exec sed -i '' 's|from "@/|from "@/ui/|g' {} +
```

> **Note:** Verify this replacement didn't break any imports. Run `pnpm typecheck` from `app/` after and fix any path errors manually.

- [ ] **Step 3: Copy CSS entry point**

The UI's `index.css` contains the Tailwind 4 entry. Copy it:

```bash
cp ui/src/index.css app/src/ui/index.css
```

- [ ] **Step 4: Commit**

```bash
git add app/src/services/ app/src/ui/ app/src/server/logger.ts
git commit -m "feat: move services and UI source to app package"
```

---

## Task 7: Root layout and React SPA catch-all

**Files:**
- Create: `app/app/layout.tsx`
- Create: `app/app/[[...slug]]/page.tsx`

- [ ] **Step 1: Create `app/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import '@/ui/index.css'

export const metadata: Metadata = {
  title: 'Paperclip',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Create `app/app/[[...slug]]/page.tsx`**

```tsx
'use client'
import App from '@/ui/App'

export default function Page() {
  return <App />
}
```

- [ ] **Step 3: Start dev server and verify UI renders**

```bash
cd app && pnpm dev
```

Open `http://localhost:3000`. Expected: The React SPA renders. React Router handles client-side navigation. Check the browser console for errors.

- [ ] **Step 4: Commit**

```bash
git add app/app/layout.tsx app/app/'[[...slug]]'/
git commit -m "feat: add root layout and React SPA catch-all page"
```

---

## Task 8: Route handler pattern + health route

Establish the route handler pattern used for all subsequent API routes.

**Files:**
- Create: `app/app/api/health/route.ts`

- [ ] **Step 1: Create `app/app/api/health/route.ts`**

Look at `server/src/routes/health.ts` for the current logic and replicate it:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export const maxDuration = 10

export async function GET(_req: NextRequest) {
  try {
    await db.execute(sql`SELECT 1`)
    return NextResponse.json({ status: 'ok', db: 'connected' })
  } catch (err) {
    return handleError(err)
  }
}
```

- [ ] **Step 2: Test the endpoint**

```bash
cd app && pnpm dev &
curl http://localhost:3000/api/health
```

Expected: `{"status":"ok","db":"connected"}`

- [ ] **Step 3: Commit**

```bash
git add app/app/api/health/
git commit -m "feat: add health route handler"
```

---

## Task 9: LLMs route

**Files:**
- Create: `app/app/api/llms/route.ts`

- [ ] **Step 1: Open `server/src/routes/llms.ts` and note all endpoints**

Read the file to understand what queries/responses are returned.

- [ ] **Step 2: Create `app/app/api/llms/route.ts`**

Standard pattern (adapt from Express source):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { db } from '@/lib/db'
import { llmService } from '@/services/llms'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const data = await llmService(db).list()
    return NextResponse.json(data)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const body = await req.json()
    const data = await llmService(db).create(body)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
```

> Adjust the service calls to match exactly what `server/src/routes/llms.ts` does.

- [ ] **Step 3: Commit**

```bash
git add app/app/api/llms/
git commit -m "feat: add llms route handler"
```

---

## Task 10: Companies + company-skills routes

**Files:**
- Create: `app/app/api/companies/route.ts`
- Create: `app/app/api/companies/[id]/route.ts`
- Create: `app/app/api/company-skills/route.ts`

- [ ] **Step 1: Read the Express source files**

Open `server/src/routes/companies.ts` and `server/src/routes/company-skills.ts`. Note every router method (`.get`, `.post`, `.patch`, `.delete`) and its path.

- [ ] **Step 2: Create `app/app/api/companies/route.ts`**

Use the standard pattern. Companies route has GET (list) and POST (create):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { createStorageService } from '@/lib/storage'
import { companyService } from '@/services/companies'
import { createCompanySchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const companies = await companyService(db).list(actor)
    return NextResponse.json(companies)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const body = await parseBody(req, createCompanySchema)
    const storage = createStorageService()
    const company = await companyService(db, storage).create(actor, body)
    return NextResponse.json(company, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
```

- [ ] **Step 3: Create `app/app/api/companies/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { createStorageService } from '@/lib/storage'
import { companyService } from '@/services/companies'
import { updateCompanySchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = await resolveActor(req)
    assertBoard(actor)
    assertCompanyAccess(actor, id)
    const company = await companyService(db).getById(id)
    return NextResponse.json(company)
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = await resolveActor(req)
    assertBoard(actor)
    assertCompanyAccess(actor, id)
    const body = await parseBody(req, updateCompanySchema)
    const storage = createStorageService()
    const company = await companyService(db, storage).update(id, actor, body)
    return NextResponse.json(company)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = await resolveActor(req)
    assertBoard(actor)
    assertCompanyAccess(actor, id)
    const storage = createStorageService()
    await companyService(db, storage).delete(id, actor)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return handleError(err)
  }
}
```

> Read `server/src/routes/companies.ts` carefully — the company route is complex with branding, portability import/export, feedback sub-routes, etc. Create additional nested route files as needed (e.g. `companies/[id]/branding/route.ts`, `companies/[id]/import/route.ts`) following the same pattern.

- [ ] **Step 4: Create `app/app/api/company-skills/route.ts`**

Read `server/src/routes/company-skills.ts` and convert all endpoints using the same pattern.

- [ ] **Step 5: Commit**

```bash
git add app/app/api/companies/ app/app/api/company-skills/
git commit -m "feat: add companies and company-skills route handlers"
```

---

## Task 11: Agents route

**Files:**
- Create: `app/app/api/agents/route.ts`
- Create: `app/app/api/agents/[id]/route.ts`

- [ ] **Step 1: Read `server/src/routes/agents.ts`**

Note all endpoints, schemas used, service methods called.

- [ ] **Step 2: Create `app/app/api/agents/route.ts` and `[id]/route.ts`**

Apply the standard pattern:

```typescript
// app/app/api/agents/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { parseBody, parseQuery } from '@/server/validate'
import { db } from '@/lib/db'
import { agentService } from '@/services/agents'
import { createAgentSchema } from '@paperclipai/shared'
import { z } from 'zod'

export const maxDuration = 30

const listQuerySchema = z.object({
  companyId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const query = parseQuery(req, listQuerySchema)
    const agents = await agentService(db).list(actor, query)
    return NextResponse.json(agents)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const body = await parseBody(req, createAgentSchema)
    assertCompanyAccess(actor, body.companyId)
    const agent = await agentService(db).create(actor, body)
    return NextResponse.json(agent, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
```

Mirror the same pattern for `[id]/route.ts` (GET, PATCH, DELETE).

- [ ] **Step 3: Commit**

```bash
git add app/app/api/agents/
git commit -m "feat: add agents route handlers"
```

---

## Task 12: Projects + goals routes

**Files:**
- Create: `app/app/api/projects/route.ts`
- Create: `app/app/api/projects/[id]/route.ts`
- Create: `app/app/api/goals/route.ts`
- Create: `app/app/api/goals/[id]/route.ts`

- [ ] **Step 1: Read `server/src/routes/projects.ts` and `goals.ts`**

- [ ] **Step 2: Create all four route files** using the standard pattern (resolveActor → assertBoard → service call → return NextResponse.json).

- [ ] **Step 3: Commit**

```bash
git add app/app/api/projects/ app/app/api/goals/
git commit -m "feat: add projects and goals route handlers"
```

---

## Task 13: Issues route (includes file uploads)

**Files:**
- Create: `app/app/api/issues/route.ts`
- Create: `app/app/api/issues/[id]/route.ts`

Issues is the most complex route — it has file uploads, comments, work products, labels, checkout, approvals. Read `server/src/routes/issues.ts` carefully.

- [ ] **Step 1: Read `server/src/routes/issues.ts`** — note every sub-path.

- [ ] **Step 2: Handle file upload endpoints**

For any endpoint that previously used `multer`, use `request.formData()`:

```typescript
// In issue attachment upload endpoint
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = await resolveActor(req)
    assertBoard(actor)

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) throw badRequest('No file provided')

    const buffer = Buffer.from(await file.arrayBuffer())
    const storage = createStorageService()
    const result = await issueService(db, storage).uploadAttachment(id, actor, {
      buffer,
      originalname: file.name,
      mimetype: file.type,
      size: file.size,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
```

- [ ] **Step 3: Create nested route files**

Issues has nested paths like `/issues/:id/comments`, `/issues/:id/labels`, etc. Create them as:
- `app/app/api/issues/[id]/comments/route.ts`
- `app/app/api/issues/[id]/labels/route.ts`
- `app/app/api/issues/[id]/attachments/route.ts`
- `app/app/api/issues/[id]/checkout/route.ts`
- `app/app/api/issues/[id]/approvals/route.ts`
- `app/app/api/issues/[id]/work-products/route.ts`
- `app/app/api/issues/[id]/documents/route.ts`

Each follows the standard pattern. Read the Express source for exact service calls.

- [ ] **Step 4: Commit**

```bash
git add app/app/api/issues/
git commit -m "feat: add issues route handlers"
```

---

## Task 14: Sprints + groups routes

**Files:**
- Create: `app/app/api/sprints/route.ts`
- Create: `app/app/api/sprints/[id]/route.ts`
- Create: `app/app/api/groups/route.ts`
- Create: `app/app/api/groups/[id]/route.ts`

- [ ] **Step 1: Read `server/src/routes/sprints.ts` and `server/src/routes/groups.ts`**

Groups was added in the latest pull — review `server/src/routes/groups.ts` and `server/src/services/groups.ts` carefully.

- [ ] **Step 2: Create route files** using the standard pattern.

Sprints may have nested routes (`/sprints/:id/issues`, `/sprints/:id/close`). Create them as nested directories.

- [ ] **Step 3: Commit**

```bash
git add app/app/api/sprints/ app/app/api/groups/
git commit -m "feat: add sprints and groups route handlers"
```

---

## Task 15: Pipelines route

**Files:**
- Create: `app/app/api/pipelines/route.ts`
- Create: `app/app/api/pipelines/[id]/route.ts`

- [ ] **Step 1: Read `server/src/routes/pipelines.ts`**

Pipelines uses Redis client — pass it via `getRedis()`.

- [ ] **Step 2: Create route files**

```typescript
// app/app/api/pipelines/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { pipelineService } from '@/services/pipelines'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const redis = await getRedis()
    const pipelines = await pipelineService(db, redis).list(actor)
    return NextResponse.json(pipelines)
  } catch (err) {
    return handleError(err)
  }
}
```

Mirror for POST and `[id]` handlers.

- [ ] **Step 3: Commit**

```bash
git add app/app/api/pipelines/
git commit -m "feat: add pipelines route handlers"
```

---

## Task 16: Activity, analytics, audit, dashboard, sidebar-badges

**Files:**
- Create: `app/app/api/activity/route.ts`
- Create: `app/app/api/analytics/route.ts`
- Create: `app/app/api/audit/route.ts`
- Create: `app/app/api/dashboard/route.ts`
- Create: `app/app/api/sidebar-badges/route.ts`

- [ ] **Step 1: Read each Express route file**

`dashboard` and `sidebar-badges` use Redis — use `getRedis()` as shown in Task 15.

- [ ] **Step 2: Create all five route files** using the standard pattern.

- [ ] **Step 3: Commit**

```bash
git add app/app/api/activity/ app/app/api/analytics/ app/app/api/audit/ app/app/api/dashboard/ app/app/api/sidebar-badges/
git commit -m "feat: add activity, analytics, audit, dashboard, sidebar-badges routes"
```

---

## Task 17: Costs + cost-recommendations routes

**Files:**
- Create: `app/app/api/costs/route.ts`
- Create: `app/app/api/cost-recommendations/route.ts`

- [ ] **Step 1: Read `server/src/routes/costs.ts` and `cost-recommendations.ts`**

- [ ] **Step 2: Create route files** using the standard pattern.

- [ ] **Step 3: Commit**

```bash
git add app/app/api/costs/ app/app/api/cost-recommendations/
git commit -m "feat: add costs and cost-recommendations routes"
```

---

## Task 18: Knowledge + search routes

**Files:**
- Create: `app/app/api/knowledge/route.ts`
- Create: `app/app/api/search/route.ts`

- [ ] **Step 1: Read source files and create route handlers** using the standard pattern.

- [ ] **Step 2: Commit**

```bash
git add app/app/api/knowledge/ app/app/api/search/
git commit -m "feat: add knowledge and search routes"
```

---

## Task 19: Access + instance-settings routes

**Files:**
- Create: `app/app/api/access/route.ts`
- Create: `app/app/api/instance-settings/route.ts`

- [ ] **Step 1: Read source files**

`access.ts` uses deployment mode config. Read `server/src/routes/access.ts` and replicate the logic using `process.env.PAPERCLIP_DEPLOYMENT_MODE`.

`instance-settings.ts` uses Redis.

- [ ] **Step 2: Create route files** using the standard pattern.

- [ ] **Step 3: Commit**

```bash
git add app/app/api/access/ app/app/api/instance-settings/
git commit -m "feat: add access and instance-settings routes"
```

---

## Task 20: Approvals + routines + secrets routes

**Files:**
- Create: `app/app/api/approvals/route.ts`
- Create: `app/app/api/approvals/[id]/route.ts`
- Create: `app/app/api/routines/route.ts`
- Create: `app/app/api/routines/[id]/route.ts`
- Create: `app/app/api/secrets/route.ts`

- [ ] **Step 1: Read source files and create route handlers** using the standard pattern.

- [ ] **Step 2: Commit**

```bash
git add app/app/api/approvals/ app/app/api/routines/ app/app/api/secrets/
git commit -m "feat: add approvals, routines, secrets routes"
```

---

## Task 21: Assets route (file uploads)

**Files:**
- Create: `app/app/api/assets/route.ts`

- [ ] **Step 1: Read `server/src/routes/assets.ts`**

Assets uses `multer` for file uploads. In Next.js, use `request.formData()`.

- [ ] **Step 2: Create `app/app/api/assets/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { handleError, badRequest } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { db } from '@/lib/db'
import { createStorageService } from '@/lib/storage'
import { assetService } from '@/services/assets'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const companyId = formData.get('companyId') as string | null

    if (!file) throw badRequest('No file provided')
    if (!companyId) throw badRequest('companyId required')

    assertCompanyAccess(actor, companyId)

    const buffer = Buffer.from(await file.arrayBuffer())
    const storage = createStorageService()
    const asset = await assetService(db, storage).upload(actor, {
      companyId,
      buffer,
      originalname: file.name,
      mimetype: file.type,
      size: file.size,
    })
    return NextResponse.json(asset, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) throw badRequest('companyId required')
    assertCompanyAccess(actor, companyId)
    const storage = createStorageService()
    const assets = await assetService(db, storage).list(actor, companyId)
    return NextResponse.json(assets)
  } catch (err) {
    return handleError(err)
  }
}
```

> Adjust to match exactly what `server/src/routes/assets.ts` does.

- [ ] **Step 3: Commit**

```bash
git add app/app/api/assets/
git commit -m "feat: add assets route handler with FormData uploads"
```

---

## Task 22: Execution-workspaces + runner + remote-control

**Files:**
- Create: `app/app/api/execution-workspaces/route.ts`
- Create: `app/app/api/runner/route.ts`
- Create: `app/app/api/remote-control/route.ts`

- [ ] **Step 1: Read source files and create route handlers** using the standard pattern.

Runner handles heartbeat/agent-run status reporting. Remote-control is for remote board access. Read each file carefully for the business logic.

- [ ] **Step 2: Commit**

```bash
git add app/app/api/execution-workspaces/ app/app/api/runner/ app/app/api/remote-control/
git commit -m "feat: add execution-workspaces, runner, remote-control routes"
```

---

## Task 23: Remaining routes

**Files:**
- Create: `app/app/api/gemini-analysis/route.ts`
- Create: `app/app/api/org-chart-svg/route.ts`
- Create: `app/app/api/issues-checkout-wakeup/route.ts`

- [ ] **Step 1: Read source files and create route handlers** using the standard pattern.

`gemini-analysis` uses `StorageService` — use `createStorageService()`. `org-chart-svg` returns an SVG string — return with `Content-Type: image/svg+xml`:

```typescript
return new NextResponse(svgString, {
  headers: { 'Content-Type': 'image/svg+xml' },
})
```

- [ ] **Step 2: Commit**

```bash
git add app/app/api/gemini-analysis/ app/app/api/org-chart-svg/ app/app/api/issues-checkout-wakeup/
git commit -m "feat: add remaining route handlers"
```

---

## Task 24: SSE live events (replaces WebSocket)

**Files:**
- Create: `app/app/api/events/route.ts`
- Modify: `app/src/ui/` — update WebSocket client to EventSource

- [ ] **Step 1: Create `app/app/api/events/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { handleError, unauthorized } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { subscribeCompanyLiveEvents, subscribeGlobalLiveEvents, serializeLiveEvent } from '@/services/live-events'

export const maxDuration = 300  // Vercel Pro: up to 300s streaming

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    if (actor.type === 'none') throw unauthorized()

    const companyId = req.nextUrl.searchParams.get('companyId')

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()

        function send(event: object) {
          const data = serializeLiveEvent(event as Parameters<typeof serializeLiveEvent>[0])
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        }

        const unsubscribe = companyId
          ? subscribeCompanyLiveEvents(companyId, send)
          : subscribeGlobalLiveEvents(send)

        req.signal.addEventListener('abort', () => {
          unsubscribe()
          try { controller.close() } catch { /* already closed */ }
        })

        // Send initial ping to confirm connection
        controller.enqueue(encoder.encode(': ping\n\n'))
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    return (handleError(err) as Response)
  }
}
```

- [ ] **Step 2: Find WebSocket client code in `app/src/ui/`**

Search for `WebSocket` usage in the UI:

```bash
grep -r "WebSocket\|live-events-ws\|wss://" app/src/ui --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 3: Replace WebSocket with EventSource**

In each file found, replace the WebSocket connection with:

```typescript
// Before (WebSocket)
const ws = new WebSocket(`wss://${host}/api/live-events?companyId=${companyId}`)
ws.onmessage = (e) => handleEvent(JSON.parse(e.data))
ws.onclose = () => { /* reconnect logic */ }

// After (EventSource)
const es = new EventSource(`/api/events?companyId=${companyId}`)
es.onmessage = (e) => handleEvent(JSON.parse(e.data))
es.onerror = () => { es.close(); /* reconnect logic */ }
```

- [ ] **Step 4: Test SSE connection**

```bash
curl -N http://localhost:3000/api/events?companyId=test-company \
  -H "Authorization: Bearer <token>"
```

Expected: streaming response with `: ping` then live events as `data: {...}` lines.

- [ ] **Step 5: Commit**

```bash
git add app/app/api/events/ app/src/ui/
git commit -m "feat: add SSE live events endpoint and update UI client"
```

---

## Task 25: Vercel configuration and environment variables

**Files:**
- Modify: `vercel.json` (root)
- Create: `.env.example` (in `app/`)

- [ ] **Step 1: Update root `vercel.json`**

Replace the current content with:

```json
{
  "installCommand": "pnpm install --filter @paperclipai/app...",
  "buildCommand": "pnpm --filter @paperclipai/app build",
  "outputDirectory": "app/.next",
  "framework": "nextjs"
}
```

- [ ] **Step 2: Create `app/.env.example`**

```bash
# Database (Supabase Postgres pooler URL)
DATABASE_URL=postgresql://postgres:[password]@[host]:6543/postgres?pgbouncer=true

# Redis (VPS)
REDIS_URL=redis://[host]:6379

# Auth
BETTER_AUTH_SECRET=your-secret-key-min-32-chars
BETTER_AUTH_URL=https://your-app.vercel.app
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Storage (choose one: S3 or Supabase)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET=

# Supabase Storage (alternative)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# App
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_ALLOWED_ORIGINS=https://your-app.vercel.app
LOG_LEVEL=info
```

- [ ] **Step 3: Add all env vars to Vercel dashboard**

Log into Vercel, go to project settings → Environment Variables, and add each variable from `.env.example` with real values.

- [ ] **Step 4: Deploy to Vercel**

```bash
vercel --prod
```

Or push to the deployment branch and let CI trigger the build.

- [ ] **Step 5: Smoke test all routes**

```bash
# Health
curl https://your-app.vercel.app/api/health

# Auth (should redirect to login)
curl https://your-app.vercel.app/api/companies -I

# UI
curl https://your-app.vercel.app | grep -i "paperclip"
```

Expected: health returns `{"status":"ok"}`, companies returns 401, UI returns HTML.

- [ ] **Step 6: Commit**

```bash
git add vercel.json app/.env.example
git commit -m "feat: add Vercel deployment configuration"
```

---

## Task 26: Full typecheck + cleanup

**Files:**
- Modify: `pnpm-workspace.yaml`
- Delete: `server/` (after verification)
- Delete: `ui/` (after verification)

- [ ] **Step 1: Run typecheck on new app**

```bash
pnpm --filter @paperclipai/app typecheck 2>&1
```

Fix all TypeScript errors before proceeding.

- [ ] **Step 2: Verify all routes are implemented**

```bash
# Check every Express route file has a corresponding Next.js handler
for f in server/src/routes/*.ts; do
  module=$(basename "$f" .ts)
  if [ "$module" != "index" ] && [ "$module" != "authz" ] && [[ "$module" != plugin* ]]; then
    if [ ! -d "app/app/api/$module" ]; then
      echo "MISSING: app/app/api/$module"
    fi
  fi
done
```

Expected: no output (all routes accounted for).

- [ ] **Step 3: Run existing service tests**

```bash
pnpm test:run 2>&1 | tail -30
```

Expected: all tests pass. Fix any that reference removed Express/plugin code.

- [ ] **Step 4: Remove `server/` and `ui/` from workspace**

Only do this after the Vercel deployment is confirmed working in production.

Edit `pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - packages/adapters/*
  - cli
  - app
```

Then delete the old packages:
```bash
rm -rf server/ ui/
pnpm install
```

- [ ] **Step 5: Bump app version and commit**

```bash
git add -A
git commit -m "feat: remove legacy server and ui packages post-migration"
```

- [ ] **Step 6: Open PR to `developer`**

```bash
git push origin feature/nextjs-migration
gh pr create --title "Feature/nextjs-migration: migrate backend to Next.js 16 on Vercel" \
  --body "Migrates Express backend + Vite React frontend to a single Next.js 16.2.3 app. Deploys unified frontend+backend to Vercel. Replaces WebSockets with SSE, adds Supabase DB connection, keeps Redis on VPS."
```

---

## Quick Reference: Standard Route Handler Pattern

Every route handler in this migration follows this exact structure:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { parseBody, parseQuery } from '@/server/validate'
import { db } from '@/lib/db'
import { someService } from '@/services/some'
import { someSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    // optional: assertCompanyAccess(actor, companyId)
    const data = await someService(db).list(actor)
    return NextResponse.json(data)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const body = await parseBody(req, someSchema)
    const data = await someService(db).create(actor, body)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
```

Dynamic segments use:
```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ...
}
```
