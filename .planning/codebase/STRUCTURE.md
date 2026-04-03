# Codebase Structure

**Analysis Date:** 2026-04-03

## Directory Layout

```
paperclip/                          # Monorepo root
├── server/                         # Express HTTP/WebSocket API server (Node.js)
│   └── src/
│       ├── index.ts                # Server entry point (startServer)
│       ├── app.ts                  # Express app factory (createApp)
│       ├── config.ts               # Config loading (env + config file)
│       ├── routes/                 # Express router factories, one file per resource
│       ├── services/               # Business logic and DB access (service factories)
│       ├── adapters/               # Adapter registry; delegates to packages/adapters/*
│       ├── middleware/             # auth, logger, validate, error-handler
│       ├── realtime/               # WebSocket server (live-events-ws.ts)
│       ├── storage/                # StorageService (local disk / S3)
│       ├── auth/                   # better-auth integration (authenticated mode)
│       ├── secrets/                # Secrets provider integration
│       ├── types/                  # express.d.ts (req.actor type extension)
│       └── onboarding-assets/      # Default agent instruction files
│
├── ui/                             # React SPA (Vite + React Router + TanStack Query)
│   └── src/
│       ├── pages/                  # Full-page route components
│       ├── components/             # Reusable components
│       │   ├── ui/                 # shadcn/ui primitives
│       │   └── transcript/         # Run transcript display components
│       ├── api/                    # Fetch wrappers per resource area
│       │   └── client.ts           # Base fetch helper (ApiError, api.get/post/etc.)
│       ├── adapters/               # Per-adapter UI modules (UIAdapterModule)
│       │   └── registry.ts         # Resolves adapter by type string
│       ├── context/                # React context providers
│       ├── hooks/                  # Domain-specific React hooks
│       ├── lib/                    # Pure utilities (router, queryKeys, domain helpers)
│       ├── plugins/                # Plugin slot/launcher bridge for UI
│       └── fixtures/               # Test fixtures
│
├── packages/
│   ├── db/                         # Database package
│   │   └── src/
│   │       ├── schema/             # Drizzle schema files, one per entity table
│   │       ├── migrations/         # SQL migration files + meta/
│   │       └── client.ts           # createDb, migration utilities
│   │
│   ├── shared/                     # Shared types and validators
│   │   └── src/
│   │       ├── types/              # TypeScript domain types (one file per entity)
│   │       ├── validators/         # Zod schemas for API input validation
│   │       └── telemetry/          # Telemetry event helpers
│   │
│   ├── adapter-utils/              # Shared adapter interfaces and utilities
│   │   └── src/
│   │       ├── types.ts            # ServerAdapterModule, AdapterExecutionResult, etc.
│   │       ├── billing.ts          # Cost calculation helpers
│   │       └── session-compaction.ts
│   │
│   ├── adapters/                   # One package per supported AI agent adapter
│   │   ├── claude-local/
│   │   ├── codex-local/
│   │   ├── cursor-local/
│   │   ├── gemini-local/
│   │   ├── opencode-local/
│   │   ├── pi-local/
│   │   └── openclaw-gateway/
│   │       └── src/
│   │           ├── server/         # execute.ts, test.ts, index.ts (ServerAdapterModule)
│   │           ├── ui/             # ConfigFields.tsx, parseStdoutLine, index.ts
│   │           └── cli/            # CLI-specific adapter helpers (some adapters)
│   │
│   └── plugins/
│       ├── sdk/                    # Plugin SDK (for plugin authors and host-side factory)
│       │   └── src/
│       │       ├── define-plugin.ts
│       │       ├── host-client-factory.ts
│       │       ├── protocol.ts
│       │       └── ui/             # Plugin UI hooks and components
│       ├── create-paperclip-plugin/ # CLI scaffolder for new plugins
│       └── examples/               # Example plugins (hello-world, file-browser, etc.)
│
├── cli/                            # paperclip CLI binary
│   └── src/
│       ├── commands/               # Subcommand implementations (run, onboard, worktree, etc.)
│       ├── adapters/               # HTTP and process adapter helpers for CLI
│       ├── client/                 # API client for CLI
│       ├── config/                 # CLI config loading
│       └── utils/
│
├── tests/
│   └── e2e/                        # Playwright end-to-end tests
│
├── evals/                          # promptfoo LLM evaluation configs
├── docs/                           # User-facing documentation (Markdown)
├── doc/                            # Internal specs, plans, experimental notes
├── docker/                         # Dockerfile and container configs
├── scripts/                        # Build/release/smoke scripts
├── skills/                         # Reusable Claude skill files for agents
├── .agents/                        # Agent skill definitions (company-creator, etc.)
├── .claude/                        # Claude skill files (design-guide, etc.)
├── .planning/                      # GSD planning documents
│   └── codebase/                   # Architecture/structure/quality/concerns docs
├── pnpm-workspace.yaml             # pnpm workspace definition
├── package.json                    # Root package (scripts, devDependencies)
├── tsconfig.base.json              # Base TypeScript config
└── vitest.config.ts                # Root vitest config
```

## Directory Purposes

**`server/src/routes/`:**
- Purpose: Express `Router` factories; one file per resource domain (agents, issues, projects, routines, plugins, etc.)
- Contains: Route handlers that authenticate, validate, call services, and return JSON
- Key files: `server/src/routes/index.ts` (barrel), `server/src/routes/authz.ts` (auth assertion helpers), `server/src/routes/issues.ts`, `server/src/routes/agents.ts`

**`server/src/services/`:**
- Purpose: All business logic and database queries; service factories receive a `db: Db` instance
- Contains: One service file per domain (agents, issues, heartbeat, plugins, workspace-runtime, etc.)
- Key files: `server/src/services/index.ts` (barrel exports all services), `server/src/services/heartbeat.ts` (run orchestration), `server/src/services/workspace-runtime.ts` (execution workspace + git worktree management)

**`packages/db/src/schema/`:**
- Purpose: Drizzle ORM table definitions; one file per database table
- Contains: `agents.ts`, `issues.ts`, `projects.ts`, `heartbeat_runs.ts`, `plugins.ts`, etc. (60+ tables)
- Key files: `packages/db/src/schema/index.ts` (barrel re-exports all tables)

**`packages/shared/src/types/`:**
- Purpose: Domain TypeScript types consumed by all workspace packages (no Zod, pure TS)
- Contains: `agent.ts`, `issue.ts`, `project.ts`, `heartbeat.ts`, `plugin.ts`, `workspace-runtime.ts`, etc.
- Key files: `packages/shared/src/types/index.ts` (barrel)

**`packages/shared/src/validators/`:**
- Purpose: Zod schemas for validating API request bodies; imported by server route files
- Used in: `server/src/middleware/validate.ts` wraps these to produce typed request body

**`ui/src/api/`:**
- Purpose: One module per server resource; wraps `api.get/post/put/patch/delete` from `client.ts`
- Contains: `issues.ts`, `agents.ts`, `projects.ts`, `heartbeats.ts`, `activity.ts`, etc.
- Key files: `ui/src/api/client.ts` (base fetch, `ApiError`), `ui/src/api/index.ts`

**`ui/src/lib/`:**
- Purpose: Framework-independent utilities and domain helpers
- Key files: `ui/src/lib/router.tsx` (company-prefix-aware React Router wrappers), `ui/src/lib/queryKeys.ts` (typed TanStack Query key factories), `ui/src/lib/utils.ts` (cn, formatters)

## Key File Locations

**Entry Points:**
- `server/src/index.ts`: Server startup (`startServer()`)
- `server/src/app.ts`: Express app factory (`createApp()`)
- `ui/index.html`: UI entry (Vite processes → mounts React)
- `cli/src/index.ts`: CLI entry point

**Configuration:**
- `server/src/config.ts`: Server config type and `loadConfig()` — reads env vars and config file
- `ui/vite.config.ts`: Vite build/dev config; defines `@` alias for `ui/src`
- `tsconfig.base.json`: Base TypeScript settings extended by all packages
- `pnpm-workspace.yaml`: Workspace package glob definitions

**Core Logic:**
- `server/src/services/heartbeat.ts`: Agent run queue, execution orchestration, orphan reaping
- `server/src/services/workspace-runtime.ts`: Execution workspace creation, git worktree management, runtime service lifecycle
- `server/src/adapters/registry.ts` (via `packages/adapters/*/src/server/index.ts`): Adapter dispatch
- `server/src/realtime/live-events-ws.ts`: WebSocket server for live UI updates
- `server/src/services/live-events.ts`: In-process EventEmitter pub/sub for live events

**Testing:**
- `tests/e2e/onboarding.spec.ts`: Playwright E2E test
- `server/src/__tests__/`: Server unit/integration tests
- `cli/src/__tests__/`: CLI tests
- `ui/src/**/*.test.tsx`: Component and lib unit tests (co-located)
- `vitest.config.ts`: Root vitest config (covers server + ui)

## Naming Conventions

**Files:**
- Server routes: `kebab-case.ts` matching the resource name, e.g. `execution-workspaces.ts`, `sidebar-badges.ts`
- Server services: `kebab-case.ts`, e.g. `heartbeat.ts`, `workspace-runtime.ts`, `plugin-lifecycle.ts`
- DB schema: `snake_case.ts` matching the table name, e.g. `heartbeat_runs.ts`, `agent_task_sessions.ts`
- UI pages: `PascalCase.tsx`, e.g. `IssueDetail.tsx`, `GoalDetail.tsx`
- UI components: `PascalCase.tsx`, e.g. `CommentThread.tsx`, `LiveRunWidget.tsx`
- UI API modules: `camelCase.ts`, e.g. `issues.ts`, `heartbeats.ts`, `instanceSettings.ts`
- UI hooks: `useCamelCase.ts`, e.g. `useProjectOrder.ts`, `useInboxBadge.ts`
- UI context files: `PascalCaseContext.tsx` or `PascalCaseProvider.tsx`
- Shared types: `kebab-case.ts` within `packages/shared/src/types/`

**Directories:**
- Server sub-systems are flat folders directly under `server/src/` (routes, services, middleware, adapters, storage, auth, realtime)
- Adapter packages follow a fixed layout: `src/server/`, `src/ui/`, `src/cli/`
- UI uses feature-area grouping: `pages/`, `components/`, `api/`, `adapters/`, `context/`, `hooks/`, `lib/`, `plugins/`

## Where to Add New Code

**New API resource (end-to-end):**
1. DB schema: add table file to `packages/db/src/schema/<table_name>.ts`, export from `packages/db/src/schema/index.ts`
2. Shared types: add type file to `packages/shared/src/types/<entity>.ts`, export from `packages/shared/src/types/index.ts`
3. Validators: add Zod schemas to `packages/shared/src/validators/` (or inline in route file for small schemas)
4. Service: add `server/src/services/<entity>.ts`, export from `server/src/services/index.ts`
5. Route: add `server/src/routes/<entity>.ts`, register in `server/src/app.ts` via `api.use(...)`
6. UI API module: add `ui/src/api/<entity>.ts`
7. UI page/components: add `ui/src/pages/<Entity>.tsx` and components in `ui/src/components/`

**New AI agent adapter:**
1. Create package directory `packages/adapters/<adapter-name>/`
2. Implement `src/server/execute.ts`, `src/server/test.ts`, `src/server/index.ts` (exporting a `ServerAdapterModule`)
3. Implement `src/ui/index.ts` (exporting a `UIAdapterModule` — `ConfigFields`, `parseStdoutLine`, `buildAdapterConfig`)
4. Register server adapter in `server/src/adapters/registry.ts`
5. Register UI adapter in `ui/src/adapters/registry.ts`

**New server service:**
- Add file to `server/src/services/<name>.ts`
- Export from `server/src/services/index.ts`
- Follow pattern: `export function fooService(db: Db) { return { ... } }`

**New UI component:**
- Reusable: `ui/src/components/MyComponent.tsx`
- Page-level: `ui/src/pages/MyPage.tsx`
- shadcn/ui primitive: `ui/src/components/ui/` (generated via shadcn CLI, not authored directly)

**New React hook:**
- Add to `ui/src/hooks/useSomething.ts`

**New utility (pure function):**
- Add to `ui/src/lib/<name>.ts` (client-side) or `server/src/services/<name>.ts` / `packages/shared/src/` (shared)

**New plugin:**
- Use `packages/plugins/create-paperclip-plugin/` scaffolder
- Plugin packages live outside the monorepo; examples are in `packages/plugins/examples/`

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD planning analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: By GSD map-codebase agent
- Committed: Yes

**`packages/db/src/migrations/`:**
- Purpose: Auto-generated Drizzle migration SQL files and journal
- Generated: Yes (via `pnpm db:generate`)
- Committed: Yes — never edit manually; apply via `pnpm db:migrate` or server auto-apply

**`server/src/onboarding-assets/`:**
- Purpose: Default instruction files copied to agents during onboarding
- Generated: No (curated content)
- Committed: Yes

**`evals/`:**
- Purpose: promptfoo LLM evaluation configs and test cases for agent behavior
- Generated: No
- Committed: Yes

**`releases/`:**
- Purpose: Release notes and changelog files
- Generated: Partially (by release scripts)
- Committed: Yes

---

*Structure analysis: 2026-04-03*
