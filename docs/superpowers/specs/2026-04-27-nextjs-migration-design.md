# Design: Backend Migration to Next.js 16

**Date:** 2026-04-27  
**Goal:** Migrate the Paperclip Express.js backend + Vite React frontend into a single Next.js 16.2.3+ app deployable on Vercel.

---

## Context

Current architecture:
- `server/` — Express v5, TypeScript, 35+ route modules, Drizzle ORM, better-auth, Redis, WebSocket live events
- `ui/` — Vite + React 19 SPA, React Router, TanStack Query, deployed separately on Vercel pointing to an Easypanel-hosted API

Problems being solved:
- Two separate deployments (Vercel UI + Easypanel API)
- Plugin system and agent execution already removed (see `feature/remove-plugin-system`)
- Want a single Vercel deployment for both frontend and backend

---

## Target Stack

| Layer | Current | Target |
|---|---|---|
| Framework | Express v5 | Next.js 16.2.3+ |
| Frontend | Vite React SPA | React SPA served from Next.js catch-all |
| Database | Drizzle + embedded/external Postgres | Drizzle + Supabase (Postgres) |
| Auth | better-auth | better-auth (Next.js adapter) |
| Real-time | WebSocket (`ws`) | Server-Sent Events (SSE) |
| Redis | External | VPS Redis via `REDIS_URL` |
| Storage | S3 / Supabase Storage | Unchanged |
| Deployment | Easypanel (API) + Vercel (UI) | Vercel (unified) |

---

## Monorepo Structure

```
paperclip/
├── app/                          ← NEW: Next.js 16 package
│   ├── app/
│   │   ├── api/                  ← Route Handlers (replaces Express routes)
│   │   │   ├── auth/
│   │   │   │   └── [...all]/route.ts   ← better-auth handler
│   │   │   ├── companies/
│   │   │   │   ├── route.ts            ← GET list, POST create
│   │   │   │   └── [id]/route.ts       ← GET, PATCH, DELETE
│   │   │   ├── agents/
│   │   │   ├── issues/
│   │   │   ├── projects/
│   │   │   ├── sprints/
│   │   │   ├── groups/
│   │   │   ├── pipelines/
│   │   │   ├── goals/
│   │   │   ├── approvals/
│   │   │   ├── routines/
│   │   │   ├── secrets/
│   │   │   ├── costs/
│   │   │   ├── activity/
│   │   │   ├── dashboard/
│   │   │   ├── analytics/
│   │   │   ├── audit/
│   │   │   ├── knowledge/
│   │   │   ├── search/
│   │   │   ├── assets/
│   │   │   ├── access/
│   │   │   ├── instance-settings/
│   │   │   ├── llms/
│   │   │   ├── runner/
│   │   │   ├── health/route.ts
│   │   │   └── events/route.ts         ← SSE live events endpoint
│   │   ├── [[...slug]]/
│   │   │   └── page.tsx                ← Catch-all: serves React SPA
│   │   └── layout.tsx                  ← Root layout (minimal, no SSR UI)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── db.ts                   ← Drizzle client (Supabase connection)
│   │   │   ├── redis.ts                ← Redis client (VPS)
│   │   │   ├── auth.ts                 ← better-auth server instance
│   │   │   └── storage.ts             ← Storage service (S3/Supabase)
│   │   ├── middleware/
│   │   │   ├── auth.ts                 ← Actor resolution (board/agent/none)
│   │   │   ├── rate-limit.ts           ← Redis-backed rate limiting
│   │   │   └── validate.ts             ← Zod validation helper
│   │   ├── services/                   ← Moved from server/src/services/ (unchanged)
│   │   ├── ui/                         ← Moved from ui/src/ (unchanged)
│   │   └── errors.ts
│   ├── middleware.ts                   ← Next.js middleware (CORS, auth gate)
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── package.json
├── packages/
│   ├── db/                            ← Unchanged (schema + migrations)
│   └── shared/                        ← Unchanged
└── server/                            ← Deleted at end of migration
```

---

## Section 1: Frontend (React SPA)

The React SPA is **not rewritten**. All existing components, pages, hooks, and React Router routes are moved to `app/src/ui/` unchanged.

Next.js serves the SPA via a catch-all route:

```tsx
// app/app/[[...slug]]/page.tsx
'use client'
import App from '@/ui/App'

export default function Page() {
  return <App />
}
```

The root `layout.tsx` includes the CSS entry point (Tailwind) and nothing else — no server-side data fetching, no SSR for the UI. The React app hydrates and takes over client-side exactly as before.

**React Router stays.** No changes to routing logic in the UI.

---

## Section 2: API Routes (Express → Next.js Route Handlers)

### Conversion pattern

Each Express router module maps to one or more Next.js route handler files:

```typescript
// Express (server/src/routes/companies.ts)
router.get('/', async (req, res) => {
  const actor = req.actor
  const companies = await companiesService(db).list(actor)
  res.json(companies)
})

// Next.js (app/app/api/companies/route.ts)
import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/middleware/auth'
import { db } from '@/lib/db'
import { companiesService } from '@/services/companies'

export async function GET(req: NextRequest) {
  const actor = await resolveActor(req)
  const companies = await companiesService(db).list(actor)
  return NextResponse.json(companies)
}
```

### Middleware strategy

Express middleware (`actorMiddleware`, `boardMutationGuard`, `createRateLimiter`) becomes:
- **`middleware.ts`** (Next.js root): CORS headers, Redis rate limiting, basic auth gate
- **`resolveActor(req)`** helper: called at the top of each route handler that needs it — same logic as current `actorMiddleware`
- **`assertBoard(actor)`** helper: same pattern as current `authz.ts`

### Route inventory (35 Express routers → Next.js route handlers)

| Module | Files |
|---|---|
| health | `api/health/route.ts` |
| auth | `api/auth/[...all]/route.ts` |
| companies | `api/companies/route.ts`, `api/companies/[id]/route.ts` |
| company-skills | `api/company-skills/route.ts` |
| agents | `api/agents/route.ts`, `api/agents/[id]/route.ts` |
| projects | `api/projects/route.ts`, `api/projects/[id]/route.ts` |
| issues | `api/issues/route.ts`, `api/issues/[id]/route.ts` |
| sprints | `api/sprints/route.ts`, `api/sprints/[id]/route.ts` |
| groups | `api/groups/route.ts`, `api/groups/[id]/route.ts` |
| pipelines | `api/pipelines/route.ts`, `api/pipelines/[id]/route.ts` |
| goals | `api/goals/route.ts` |
| approvals | `api/approvals/route.ts` |
| routines | `api/routines/route.ts` |
| secrets | `api/secrets/route.ts` |
| costs | `api/costs/route.ts` |
| activity | `api/activity/route.ts` |
| dashboard | `api/dashboard/route.ts` |
| analytics | `api/analytics/route.ts` |
| audit | `api/audit/route.ts` |
| knowledge | `api/knowledge/route.ts` |
| search | `api/search/route.ts` |
| assets | `api/assets/route.ts` |
| access | `api/access/route.ts` |
| instance-settings | `api/instance-settings/route.ts` |
| llms | `api/llms/route.ts` |
| runner | `api/runner/route.ts` |
| sidebar-badges | `api/sidebar-badges/route.ts` |
| execution-workspaces | `api/execution-workspaces/route.ts` |
| remote-control | `api/remote-control/route.ts` |
| cost-recommendations | `api/cost-recommendations/route.ts` |
| gemini-analysis | `api/gemini-analysis/route.ts` |
| issues-checkout-wakeup | `api/issues-checkout-wakeup/route.ts` |
| org-chart-svg | `api/org-chart-svg/route.ts` |
| events (SSE) | `api/events/route.ts` |

---

## Section 3: Real-time (WebSocket → SSE)

The current `realtime/live-events-ws.ts` WebSocket server is replaced by a **streaming SSE endpoint**.

```typescript
// app/app/api/events/route.ts
export async function GET(req: NextRequest) {
  const actor = await resolveActor(req)
  // validate actor...

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const unsubscribe = subscribeCompanyLiveEvents(actor.companyId, send)
      req.signal.addEventListener('abort', () => {
        unsubscribe()
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

**UI change:** `live-events-ws.ts` client → `EventSource('/api/events')`. The existing `subscribeCompanyLiveEvents` service function stays unchanged.

---

## Section 4: Database & Auth

### Drizzle + Supabase

```typescript
// app/src/lib/db.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@paperclipai/db'

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, { schema })
```

`DATABASE_URL` points to the Supabase Postgres connection string. The `@paperclipai/db` package (schema + migrations) is unchanged.

### better-auth (Next.js adapter)

```typescript
// app/src/lib/auth.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  // ... same config as current server/src/auth/better-auth.ts
})

// app/app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
export const { GET, POST } = toNextJsHandler(auth)
```

### Redis (VPS)

```typescript
// app/src/lib/redis.ts
import { createClient } from 'redis'
export const redis = createClient({ url: process.env.REDIS_URL })
```

`REDIS_URL` points to the VPS Redis instance. Used in `middleware.ts` for rate limiting and in route handlers that currently use Redis cache.

---

## Section 5: File Uploads

`multer` is removed. File uploads use Next.js native `FormData`:

```typescript
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const buffer = Buffer.from(await file.arrayBuffer())
  // upload to S3/Supabase storage as before
}
```

---

## Section 6: Next.js Config & Vercel Deployment

```typescript
// app/next.config.ts
const config = {
  // Allow large payloads (company import/export)
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
}
```

```json
// vercel.json (root)
{
  "buildCommand": "pnpm --filter @paperclipai/app build",
  "outputDirectory": "app/.next",
  "framework": "nextjs"
}
```

**Environment variables on Vercel:**
- `DATABASE_URL` — Supabase Postgres connection string
- `REDIS_URL` — VPS Redis URL
- `BETTER_AUTH_SECRET` — auth secret
- `BETTER_AUTH_URL` — Vercel deployment URL
- `AWS_*` / `SUPABASE_*` — storage credentials (unchanged)

---

## Section 7: Migration Phases

The migration is executed in 5 ordered phases to minimize risk:

### Phase 1 — Scaffold Next.js app
- Create `app/` package with Next.js 16.2.3
- Configure Tailwind, TypeScript, path aliases
- Set up `src/lib/db.ts`, `src/lib/redis.ts`, `src/lib/auth.ts`
- Move `ui/src/` → `app/src/ui/` (no changes to files)
- Implement catch-all page serving the React SPA
- Verify UI renders correctly locally

### Phase 2 — Auth & middleware
- Implement `middleware.ts` (CORS, rate limiting)
- Port `actorMiddleware` → `resolveActor()` helper
- Mount better-auth at `api/auth/[...all]/route.ts`
- Port `authz.ts` helpers (`assertBoard`, etc.)

### Phase 3 — API routes (batch conversion)
- Convert all 29 Express route modules to Next.js Route Handlers
- Port all service files from `server/src/services/` → `app/src/services/` (mostly unchanged)
- Port middleware helpers (validate, board-mutation-guard, etc.)
- File upload routes use FormData

### Phase 4 — SSE live events
- Implement `api/events/route.ts` streaming endpoint
- Update UI client from WebSocket → EventSource
- Remove `server/src/realtime/`

### Phase 5 — Vercel deployment & cleanup
- Configure `vercel.json` and env vars
- Deploy to Vercel, smoke test all routes
- Remove `server/` and `ui/` packages from monorepo
- Update `pnpm-workspace.yaml`
- Final typecheck + test run

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Vercel function timeout on heavy routes | Set `maxDuration = 60` on heavy routes; Vercel Pro supports up to 300s |
| Redis VPS not reachable from Vercel | Ensure VPS has public IP + firewall allows Vercel egress IPs |
| SSE connections dropped by Vercel | Vercel supports streaming; set proper `Cache-Control: no-cache` |
| DB connection pool exhaustion (serverless) | Use `postgres-js` with connection pooling mode in Supabase (`?pgbouncer=true`) |
| better-auth session incompatibility | Test session migration before removing old auth |
