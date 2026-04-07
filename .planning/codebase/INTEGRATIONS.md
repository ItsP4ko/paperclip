# External Integrations

**Analysis Date:** 2026-04-03

## AI Agent Adapters

Paperclip acts as an orchestration layer that dispatches work to AI agent processes. Each adapter is a workspace package under `packages/adapters/`. All adapters are registered in `server/src/adapters/registry.ts`.

**Claude Code (Anthropic):**
- Adapter: `@paperclipai/adapter-claude-local` (`packages/adapters/claude-local/`)
- Mode: spawns `claude` CLI process locally
- Models: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-6, claude-sonnet-4-5, claude-haiku-4-5
- Auth: `ANTHROPIC_API_KEY` env var passed to subprocess
- Notes: Supports git worktree workspaces, quota windows, skills sync, JWT session auth

**OpenAI Codex:**
- Adapter: `@paperclipai/adapter-codex-local` (`packages/adapters/codex-local/`)
- Mode: spawns `@openai/codex` CLI process locally
- Auth: `OPENAI_API_KEY` env var (resolved in `server/src/adapters/codex-models.ts`)

**Cursor:**
- Adapter: `@paperclipai/adapter-cursor-local` (`packages/adapters/cursor-local/`)
- Mode: spawns Cursor agent locally

**Google Gemini:**
- Adapter: `@paperclipai/adapter-gemini-local` (`packages/adapters/gemini-local/`)
- Mode: spawns Gemini CLI locally

**OpenCode:**
- Adapter: `@paperclipai/adapter-opencode-local` (`packages/adapters/opencode-local/`)
- Mode: spawns `opencode-ai` CLI locally

**Pi (Inflection AI):**
- Adapter: `@paperclipai/adapter-pi-local` (`packages/adapters/pi-local/`)
- Mode: spawns Pi agent locally

**OpenClaw Gateway:**
- Adapter: `@paperclipai/adapter-openclaw-gateway` (`packages/adapters/openclaw-gateway/`)
- Mode: connects to remote OpenClaw gateway via WebSocket (`ws` package)
- Notes: Used for multi-host/remote agent dispatch

**Hermes (third-party):**
- Package: `hermes-paperclip-adapter` 0.2.0 (external npm package)
- Integrated in `server/src/adapters/registry.ts`

## Data Storage

**Primary Database:**
- PostgreSQL via `@paperclipai/db` (`packages/db/`)
- ORM: Drizzle ORM 0.38.4 with `postgres` client (`postgres` npm package 3.x)
- Connection: `DATABASE_URL` env var (`postgres://user:pass@host:port/dbname`)
- Migrations: SQL files in `packages/db/src/migrations/` (numbered 0000–N), applied via `packages/db/src/migrate.ts`
- Schema: Drizzle schema defined in `packages/db/src/schema/` (50+ table files covering agents, issues, companies, plugins, secrets, auth, etc.)
- Embedded mode: `embedded-postgres` 18.1.0-beta.16 bundles a full PostgreSQL instance for single-host deployments (default port 54329, data dir configurable via config file)
- External mode: set `database.mode = "postgres"` in config file and provide `DATABASE_URL`

**File Storage:**
- Two providers selectable via `PAPERCLIP_STORAGE_PROVIDER` or config file `storage.provider`:
  1. `local_disk` (default) - stores files under `PAPERCLIP_STORAGE_LOCAL_DIR` or `~/.paperclip/instances/<name>/storage/`
  2. `s3` - uses `@aws-sdk/client-s3`; compatible with AWS S3 and any S3-compatible store (MinIO, etc.)
- S3 configuration env vars: `PAPERCLIP_STORAGE_S3_BUCKET`, `PAPERCLIP_STORAGE_S3_REGION`, `PAPERCLIP_STORAGE_S3_ENDPOINT`, `PAPERCLIP_STORAGE_S3_PREFIX`, `PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE`
- Storage service: `server/src/storage/` (provider registry, service, types)

**Caching:**
- None detected - no Redis or in-memory cache layer

## Authentication & Identity

**Auth Provider:**
- better-auth 1.4.18 (self-hosted, email/password)
- Implementation: `server/src/auth/better-auth.ts`
- Database adapter: `drizzle-orm` via `better-auth/adapters/drizzle`
- Session tables: `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications` in `packages/db/src/schema/auth.ts`
- Sign-up can be disabled via `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` or config file
- Agent-level auth uses JWT tokens (`server/src/agent-auth-jwt.ts`, env var `PAPERCLIP_AGENT_JWT_SECRET`)
- Board API keys supported (schema: `packages/db/src/schema/board_api_keys.ts`)
- CLI auth challenges supported (schema: `packages/db/src/schema/cli_auth_challenges.ts`)

**Configuration:**
- `BETTER_AUTH_SECRET` (or `PAPERCLIP_AGENT_JWT_SECRET`) - auth signing secret
- `PAPERCLIP_PUBLIC_URL` or `BETTER_AUTH_URL` - public base URL for cookie/redirect
- `PAPERCLIP_AUTH_BASE_URL_MODE` - `auto` or `explicit`
- `PAPERCLIP_AUTH_PUBLIC_BASE_URL` - explicit auth base URL

## Secrets Management

Three pluggable providers selectable via `PAPERCLIP_SECRETS_PROVIDER` or config file `secrets.provider`:

1. `local_encrypted` (default) - AES-encrypted at rest on local disk; master key file path: `PAPERCLIP_SECRETS_MASTER_KEY_FILE`
2. `aws_secrets_manager` - AWS Secrets Manager stub (`server/src/secrets/external-stub-providers.ts`)
3. `gcp_secret_manager` - GCP Secret Manager stub
4. `vault` - HashiCorp Vault stub

Provider registry: `server/src/secrets/provider-registry.ts`
Note: AWS/GCP/Vault providers are listed as stubs; `local_encrypted` is the only fully implemented provider.

## GitHub Integration

**GitHub API:**
- Used for fetching files from GitHub/GitHub Enterprise repositories
- Implementation: `server/src/services/github-fetch.ts`
- Supports both `github.com` (uses `https://api.github.com` and `https://raw.githubusercontent.com`) and GitHub Enterprise (`https://<hostname>/api/v3`)
- Auth: token passed per-request (stored as agent/company secret)
- Routes: `server/src/routes/github-fetch.ts`

## Monitoring & Observability

**Telemetry (opt-in):**
- Custom telemetry client in `packages/shared/src/telemetry/`
- Events: install started/completed, company imported, agent first heartbeat, agent task completed, error handler crash
- Flush interval: 60 seconds
- Backend: `PAPERCLIP_FEEDBACK_EXPORT_BACKEND_URL` (or legacy `PAPERCLIP_TELEMETRY_BACKEND_URL`)
- Auth token: `PAPERCLIP_FEEDBACK_EXPORT_BACKEND_TOKEN`
- Can be disabled via config file `telemetry.enabled = false`
- State stored locally in `~/.paperclip/instances/<name>/telemetry/`

**Feedback Export:**
- Feedback trace bundles POSTed to `PAPERCLIP_FEEDBACK_EXPORT_BACKEND_URL/feedback-traces`
- Implementation: `server/src/services/feedback-share-client.ts`
- Flush interval: 5 seconds

**Logging:**
- pino 9.x structured logging (`server/src/middleware/logger.ts`)
- pino-http for HTTP request logging
- pino-pretty for development output
- Log mode configurable via config file `logging.mode` (`console` | `file`)

**Error Tracking:**
- None (no Sentry, Datadog, or similar detected)

## CI/CD & Deployment

**Hosting:**
- Docker container (self-hosted or any container platform)
- Image: `ghcr.io/paperclipai/paperclip` (published to GitHub Container Registry)
- Platforms: `linux/amd64`, `linux/arm64`

**CI Pipeline:**
- GitHub Actions (`.github/workflows/`)
  - `pr.yml` - Policy check, typecheck, unit tests, build, E2E tests on every PR to `master`
  - `docker.yml` - Build and push Docker image on push to `master` or version tags
  - `e2e.yml` - Manual E2E test run with optional LLM assertions
  - `release.yml` - Release automation
  - `release-smoke.yml` - Release smoke tests via Playwright
  - `refresh-lockfile.yml` - Automated lockfile refresh

**Release:**
- Scripts: `scripts/release.sh`, `scripts/create-github-release.sh`
- Canary and stable release channels
- Published to npm as `paperclipai` (CLI) and `@paperclipai/*` scoped packages

## Webhooks & Callbacks

**Incoming (Routine Webhooks):**
- Routines can be triggered via incoming webhooks (schema: `packages/db/src/schema/routines.ts` with `ROUTINE_TRIGGER_KINDS` and `ROUTINE_TRIGGER_SIGNING_MODES` in `packages/shared/src/`)
- Signing modes supported (HMAC verification)
- Route: `server/src/routes/routines.ts`

**Plugin Webhooks:**
- Plugins can register webhooks (schema: `packages/db/src/schema/plugin_webhooks.ts`)

**Outgoing:**
- Feedback trace export to configurable backend URL (see telemetry section above)

## Realtime

**WebSocket:**
- Live event streaming to UI clients via WebSocket (`ws` 8.x)
- Implementation: `server/src/realtime/live-events-ws.ts`
- UI proxies WebSocket via Vite dev server (`/api` → `localhost:3100` with `ws: true` in `ui/vite.config.ts`)

## Environment Variables Reference

**Required:**
- `DATABASE_URL` - PostgreSQL connection string (only when using external postgres mode)
- `PORT` - Server port (default: 3100)

**Auth:**
- `BETTER_AUTH_SECRET` / `PAPERCLIP_AGENT_JWT_SECRET` - Auth signing secret
- `PAPERCLIP_PUBLIC_URL` / `BETTER_AUTH_URL` - Public base URL
- `PAPERCLIP_AUTH_DISABLE_SIGN_UP` - Disable new registrations (true/false)

**Deployment:**
- `PAPERCLIP_DEPLOYMENT_MODE` - `local_trusted` | `authenticated`
- `PAPERCLIP_DEPLOYMENT_EXPOSURE` - `private` | `public`
- `HOST` - Bind address (default: `127.0.0.1`)
- `SERVE_UI` - Whether server serves bundled UI (default: true)
- `PAPERCLIP_ALLOWED_HOSTNAMES` - Comma-separated trusted hostnames

**Storage:**
- `PAPERCLIP_STORAGE_PROVIDER` - `local_disk` | `s3`
- `PAPERCLIP_STORAGE_LOCAL_DIR` - Local storage base directory
- `PAPERCLIP_STORAGE_S3_BUCKET`, `PAPERCLIP_STORAGE_S3_REGION`, `PAPERCLIP_STORAGE_S3_ENDPOINT`, `PAPERCLIP_STORAGE_S3_PREFIX`, `PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE`

**Secrets:**
- `PAPERCLIP_SECRETS_PROVIDER` - `local_encrypted` | `aws_secrets_manager` | `gcp_secret_manager` | `vault`
- `PAPERCLIP_SECRETS_MASTER_KEY_FILE` - Path to encryption key file
- `PAPERCLIP_SECRETS_STRICT_MODE` - Fail if secrets unavailable (true/false)

**Database Backup:**
- `PAPERCLIP_DB_BACKUP_ENABLED` - Enable automatic backups (default: true)
- `PAPERCLIP_DB_BACKUP_INTERVAL_MINUTES` - Backup interval (default: 60)
- `PAPERCLIP_DB_BACKUP_RETENTION_DAYS` - Retention period (default: 30)
- `PAPERCLIP_DB_BACKUP_DIR` - Backup directory

**Telemetry/Feedback:**
- `PAPERCLIP_FEEDBACK_EXPORT_BACKEND_URL` - Feedback export endpoint
- `PAPERCLIP_FEEDBACK_EXPORT_BACKEND_TOKEN` - Auth token for feedback export

**Agent Keys (passed through to subprocesses):**
- `ANTHROPIC_API_KEY` - For claude_local adapter
- `OPENAI_API_KEY` - For codex_local adapter

---

*Integration audit: 2026-04-03*
