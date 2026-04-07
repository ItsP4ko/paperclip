# Architecture

**Analysis Date:** 2026-04-03

## Pattern Overview

**Overall:** Multi-tier monorepo — Express REST API backend + React SPA frontend + extensible adapter and plugin systems

**Key Characteristics:**
- Service-layer pattern on the backend: every entity (agents, issues, projects, etc.) has a dedicated service module in `server/src/services/` that encapsulates all database access
- Adapter abstraction: AI coding agent integrations (Claude, Codex, Cursor, Gemini, etc.) are implemented as pluggable adapter modules conforming to a shared interface, registered in a runtime registry
- Plugin system: third-party features are loaded at runtime from packaged plugin bundles; they run in worker sandboxes and communicate with the host via a JSON-RPC–style protocol
- Company-scoped multi-tenancy: every resource (agents, issues, projects, routines) belongs to a `company`; all API authorization checks are gated at the company level
- Real-time push: server publishes `LiveEvent` objects via Node.js `EventEmitter`; a WebSocket server bridges these to the browser UI
- Embedded or external PostgreSQL: server auto-manages an embedded Postgres process when no `DATABASE_URL` is set, or connects to an external one

## Layers

**Database (`packages/db`):**
- Purpose: Schema definitions, migrations, and the Drizzle ORM client
- Location: `packages/db/src/`
- Contains: Schema files per entity under `packages/db/src/schema/`, migration files under `packages/db/src/migrations/`, and `client.ts` for `createDb` / migration utilities
- Depends on: `drizzle-orm`, PostgreSQL driver
- Used by: `server` only — no direct DB access from `ui` or `cli`

**Shared Types (`packages/shared`):**
- Purpose: TypeScript type definitions and validators shared across server, UI, and CLI
- Location: `packages/shared/src/`
- Contains: Domain types in `packages/shared/src/types/`, Zod validators in `packages/shared/src/validators/`, constants, telemetry helpers
- Depends on: nothing else in the monorepo
- Used by: `server`, `ui`, `cli`, adapter packages

**Adapter Utils (`packages/adapter-utils`):**
- Purpose: Shared interfaces, session codecs, billing helpers, and log-parsing utilities used by all adapter packages
- Location: `packages/adapter-utils/src/`
- Contains: `types.ts` (ServerAdapterModule, AdapterExecutionResult, etc.), `billing.ts`, `session-compaction.ts`, `server-utils.ts`
- Depends on: `packages/shared`
- Used by: all adapter packages under `packages/adapters/`, `server`

**Adapter Packages (`packages/adapters/*`):**
- Purpose: One package per supported AI coding agent (claude-local, codex-local, cursor-local, gemini-local, opencode-local, pi-local, openclaw-gateway)
- Location: `packages/adapters/<adapter-name>/src/`
- Contains per-adapter: `server/execute.ts` (spawns the process / calls the API), `server/test.ts` (environment health check), `server/index.ts` (exports `ServerAdapterModule`), `ui/` (React config form + stdout parser)
- Depends on: `packages/adapter-utils`, `packages/shared`
- Used by: `server` loads all adapters via a registry (`server/src/adapters/registry.ts`)

**Server (`server`):**
- Purpose: The Express HTTP + WebSocket API server; orchestrates agents, runs, plugins, and storage
- Location: `server/src/`
- Entry point: `server/src/index.ts` (exports `startServer()`)
- Sub-layers:
  - **Routes** (`server/src/routes/`): Express router factories, one file per resource area — they call services and enforce authorization via `authz.ts` helpers
  - **Services** (`server/src/services/`): Business logic; access the database via Drizzle; published via barrel `server/src/services/index.ts`
  - **Adapters** (`server/src/adapters/`): Registry that resolves an adapter module by type; delegates execution to the selected adapter package
  - **Middleware** (`server/src/middleware/`): `auth.ts` (actor resolution), `logger.ts`, `validate.ts`, `board-mutation-guard.ts`, `private-hostname-guard.ts`, `error-handler.ts`
  - **Realtime** (`server/src/realtime/`): WebSocket server setup (`live-events-ws.ts`)
  - **Storage** (`server/src/storage/`): Pluggable file storage (local disk or S3) exposed as a `StorageService`
  - **Auth** (`server/src/auth/`): `better-auth.ts` integration for authenticated deployment mode
  - **Plugin infrastructure** (`server/src/services/plugin-*.ts`): lifecycle, registry, worker manager, job scheduler, tool dispatcher, event bus, dev watcher
- Depends on: `packages/db`, `packages/shared`, `packages/adapter-utils`, all adapter packages, `packages/plugins/sdk`

**Plugin SDK (`packages/plugins/sdk`):**
- Purpose: SDK for third-party plugin authors; also used internally to build host-side handler factories
- Location: `packages/plugins/sdk/src/`
- Contains: `define-plugin.ts`, `host-client-factory.ts`, `protocol.ts`, UI hooks/components in `ui/`
- Used by: `server` (host side), plugin packages (author side)

**UI (`ui`):**
- Purpose: React single-page application; routes via React Router; fetches data with TanStack Query
- Location: `ui/src/`
- Entry point: `ui/index.html` → Vite dev server or built static assets served by Express
- Sub-layers:
  - **Pages** (`ui/src/pages/`): Full-page route components (one per major entity view)
  - **Components** (`ui/src/components/`): Reusable React components; shadcn/ui primitives under `ui/src/components/ui/`
  - **API layer** (`ui/src/api/`): Thin fetch wrappers per resource; all use `api/client.ts` which appends `/api` and throws `ApiError` on non-2xx
  - **Adapters** (`ui/src/adapters/`): Per-adapter UI modules conforming to `UIAdapterModule`; registered in `ui/src/adapters/registry.ts`
  - **Context** (`ui/src/context/`): React contexts — `CompanyContext`, `LiveUpdatesProvider` (WebSocket), `ToastContext`, `ThemeContext`, etc.
  - **Hooks** (`ui/src/hooks/`): Domain-specific React hooks
  - **Lib** (`ui/src/lib/`): Pure utilities — `router.tsx` (company-prefix-aware wrappers over react-router-dom), `queryKeys.ts`, domain helpers
  - **Plugins** (`ui/src/plugins/`): Plugin bridge, slot/launcher system (`bridge.ts`, `slots.tsx`, `launchers.tsx`)
- Depends on: `packages/shared` (types), Express backend via `/api` HTTP + WebSocket

**CLI (`cli`):**
- Purpose: Command-line tool for operators and agents (`paperclip` binary)
- Location: `cli/src/`
- Contains: `commands/` (run, onboard, worktree, routines, heartbeat-run, etc.), `adapters/` (http, process), `client/`, `config/`
- Depends on: `packages/shared`, `packages/adapter-utils`

## Data Flow

**Issue assigned to agent → run started:**

1. User creates or updates an issue via `PUT /api/issues/:id` (route: `server/src/routes/issues.ts`)
2. Route calls `issueService(db).updateIssue(...)` (`server/src/services/issues.ts`) and optionally `queueIssueAssignmentWakeup(...)` (`server/src/services/issue-assignment-wakeup.ts`)
3. `heartbeatService.resumeQueuedRuns()` picks up the queued run (`server/src/services/heartbeat.ts`)
4. Heartbeat calls `getServerAdapter(adapterType)` from `server/src/adapters/registry.ts`, resolves to e.g. `claude-local` adapter
5. Adapter's `execute()` spawns the AI agent process; streams stdout events; writes cost events and run-log chunks to DB
6. `publishLiveEvent(...)` fires a `LiveEvent` on the in-process `EventEmitter` (`server/src/services/live-events.ts`)
7. `live-events-ws.ts` relays the event over the company's WebSocket connection to the browser
8. `LiveUpdatesProvider` in `ui/src/context/LiveUpdatesProvider.tsx` receives the WS message and invalidates TanStack Query caches; components re-render

**UI data fetch pattern:**

1. Page component calls `useQuery({ queryKey: queryKeys.issues.detail(id), queryFn: () => issuesApi.getDetail(id) })`
2. `issuesApi.getDetail` in `ui/src/api/issues.ts` calls `api.get<IssueDetail>('/issues/:id')` via `ui/src/api/client.ts`
3. Client prepends `/api`, adds `credentials: include`, checks response status
4. Server route in `server/src/routes/issues.ts` resolves actor, asserts company access, calls service, returns JSON

**State Management:**
- Server: stateless per request; mutable state (running processes, plugin workers) held in in-memory maps inside service singletons
- UI: TanStack Query for all server data; React Context for cross-component state (selected company, live events, toasts, panels); no global state library (no Redux/Zustand)

## Key Abstractions

**ServerAdapterModule:**
- Purpose: Contract every AI-agent adapter must implement
- Examples: `packages/adapters/claude-local/src/server/index.ts`, `packages/adapters/openclaw-gateway/src/server/index.ts`
- Pattern: Exports `{ type, execute, testEnvironment, models, agentConfigurationDoc }`. The `execute` function streams events and returns an `AdapterExecutionResult`.

**UIAdapterModule:**
- Purpose: Contract for the UI side of each adapter
- Examples: `ui/src/adapters/claude-local/index.ts`, registered in `ui/src/adapters/registry.ts`
- Pattern: Exports `{ type, label, parseStdoutLine, ConfigFields, buildAdapterConfig }`

**Service pattern:**
- Purpose: Encapsulates all DB queries and business rules for a domain entity
- Examples: `server/src/services/issues.ts`, `server/src/services/agents.ts`, `server/src/services/heartbeat.ts`
- Pattern: `export function issueService(db: Db) { return { getDetail, createIssue, updateIssue, ... } }` — factory called per-route with the shared `db` instance

**Actor (req.actor):**
- Purpose: Identifies who is making an HTTP or WS request
- Location: `server/src/types/express.d.ts` (type), `server/src/middleware/auth.ts` (populated)
- Pattern: `req.actor.type` is `"board"` (human/session), `"agent"` (API key or JWT), or `"none"` (unauthenticated). Authorization helpers in `server/src/routes/authz.ts` assert actor type and company membership.

**LiveEvent:**
- Purpose: Server-to-client push notification for real-time UI updates
- Types defined in: `packages/shared/src/types/live.ts`
- Flow: `publishLiveEvent()` → in-process EventEmitter → WebSocket server → browser `LiveUpdatesProvider` → TanStack Query cache invalidation

## Entry Points

**Server (`server/src/index.ts`):**
- Location: `server/src/index.ts`
- Triggers: `node server/src/index.js` or `pnpm dev` in `server/`
- Responsibilities: loads config, starts/connects PostgreSQL, runs migrations, creates Express app, starts WebSocket server, initializes heartbeat/routine scheduler, starts plugin system

**Express App Factory (`server/src/app.ts`):**
- Location: `server/src/app.ts`
- Triggers: called by `startServer()` in `index.ts`
- Responsibilities: wires all middleware and route factories, initializes the full plugin infrastructure, configures UI serving mode (static or Vite dev proxy)

**UI (`ui/index.html`):**
- Location: `ui/index.html` → `ui/src/main.tsx` (inferred from Vite convention)
- Triggers: browser navigation or `pnpm dev` in `ui/` which starts Vite on port 5173 with `/api` proxied to `localhost:3100`
- Responsibilities: Mounts the React app with React Router, TanStack Query client, all context providers

**CLI (`cli/src/index.ts`):**
- Location: `cli/src/index.ts`
- Triggers: `paperclip <command>` invocation
- Responsibilities: Dispatches to subcommands (run, onboard, worktree, routines, etc.)

## Error Handling

**Strategy:** Throw typed `HttpError` instances in services/routes; a central error-handler middleware serializes them to JSON.

**Patterns:**
- Services and routes throw helpers from `server/src/errors.ts`: `badRequest()`, `unauthorized()`, `forbidden()`, `notFound()`, `conflict()`, `unprocessable()`
- `server/src/middleware/error-handler.ts` catches these and returns `{ error: message }` with the appropriate HTTP status
- UI catches errors as `ApiError` (from `ui/src/api/client.ts`) and surfaces them via `useToast` or inline error state

## Cross-Cutting Concerns

**Logging:** `pino` via `server/src/middleware/logger.ts`; structured JSON logs with `logger.info/warn/error({ context }, message)`. Log redaction applied to sensitive run output in `server/src/log-redaction.ts`.

**Validation:** Zod schemas defined in `packages/shared/src/validators/`; imported into route files and applied via `validate()` middleware from `server/src/middleware/validate.ts`.

**Authentication:** Two deployment modes — `local_trusted` (loopback-only, no auth required) and `authenticated` (better-auth session cookies + optional board API keys and agent JWTs). Mode-specific logic in `server/src/auth/better-auth.ts`; actor resolution in `server/src/middleware/auth.ts`.

---

*Architecture analysis: 2026-04-03*
