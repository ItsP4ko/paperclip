# Technology Stack

**Analysis Date:** 2026-04-03

## Languages

**Primary:**
- TypeScript 5.7.x - All packages (server, UI, CLI, shared, adapters, plugins, db)

**Secondary:**
- SQL - Database migration files in `packages/db/src/migrations/`
- Shell (Bash) - Release, build, and smoke scripts in `scripts/`

## Runtime

**Environment:**
- Node.js >=20 (required minimum), Node.js 24 used in CI

**Package Manager:**
- pnpm 9.15.4
- Lockfile: `pnpm-lock.yaml` present (CI-owned; manual edits blocked by PR policy)

## Monorepo Layout

Managed via `pnpm-workspace.yaml`. Packages:
- `packages/*` - Shared libraries (db, shared, adapter-utils)
- `packages/adapters/*` - AI agent adapters (claude-local, codex-local, cursor-local, gemini-local, openclaw-gateway, opencode-local, pi-local)
- `packages/plugins/*` - Plugin SDK and scaffolding tools
- `server` - Express.js backend (`@paperclipai/server`)
- `ui` - React SPA frontend (`@paperclipai/ui`)
- `cli` - CLI tool (`paperclipai`)

## Frameworks

**Backend:**
- Express.js 5.1.0 - HTTP server (`server/src/app.ts`)
- better-auth 1.4.18 - Authentication layer (`server/src/auth/better-auth.ts`)
- drizzle-orm 0.38.4 - ORM/query builder used in server and db package

**Frontend:**
- React 19.0.0 - UI framework (`ui/src/main.tsx`)
- Vite 6.1.0 - Build tool and dev server (`ui/vite.config.ts`)
- React Router DOM 7.1.5 - Client-side routing
- TanStack React Query 5.x - Server state management
- Tailwind CSS 4.0.7 (via `@tailwindcss/vite`) - Styling
- Radix UI - Headless component primitives
- Lexical 0.35.0 + MDXEditor 3.x - Rich text editing

**CLI:**
- commander 13.x - Argument parsing (`cli/src/index.ts`)
- @clack/prompts - Interactive CLI prompts
- esbuild - CLI bundle build (`cli/esbuild.config.mjs`)

**Testing:**
- Vitest 3.0.5 - Unit/integration test runner (root `vitest.config.ts` with projects for `packages/db`, `packages/adapters/codex-local`, `packages/adapters/opencode-local`, `server`, `ui`, `cli`)
- Playwright 1.58.2 - E2E tests (`tests/e2e/`, `tests/release-smoke/`)

**Build/Dev:**
- tsx 4.19.2 - TypeScript execution in dev and scripts
- TypeScript compiler (tsc) - Type checking and production builds
- tsconfig.base.json - Shared TS config (ES2023 target, NodeNext module, strict mode)

## Key Dependencies

**Critical:**
- `drizzle-orm` 0.38.4 - Database access across server, db, and CLI packages
- `embedded-postgres` 18.1.0-beta.16 - Bundled PostgreSQL for single-binary deployment (patched: `patches/embedded-postgres@18.1.0-beta.16.patch`)
- `better-auth` 1.4.18 - Email/password authentication with Drizzle adapter
- `zod` 3.24.x - Runtime schema validation in server and shared packages
- `ws` 8.x - WebSocket server for realtime events (`server/src/realtime/live-events-ws.ts`) and openclaw gateway adapter
- `@aws-sdk/client-s3` 3.x - S3-compatible object storage (server)
- `express` 5.1.0 - HTTP server

**Infrastructure:**
- `pino` 9.x + `pino-http` 10.x + `pino-pretty` - Structured logging
- `multer` 2.0.2 - File upload handling (server)
- `sharp` 0.34.5 - Image processing (server)
- `chokidar` 4.x - File watching for plugin dev and dev-watch mode
- `dotenv` 17.x - .env file loading (server and CLI)
- `ajv` 8.x + `ajv-formats` - JSON Schema validation
- `dompurify` 3.x + `jsdom` 28.x - HTML sanitization (server-side)
- `hermes-paperclip-adapter` 0.2.0 - Third-party agent adapter integration

**UI-specific:**
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` - Drag and drop
- `mermaid` 11.x - Diagram rendering
- `react-markdown` 10.x + `remark-gfm` - Markdown rendering
- `cmdk` 1.x - Command palette
- `lucide-react` - Icon library
- `class-variance-authority`, `clsx`, `tailwind-merge` - CSS utility composition
- `@mdxeditor/editor` 3.x - Rich document editing

## Configuration

**Environment:**
- Env vars loaded from `~/.paperclip/instances/<name>/.env` (Paperclip-specific path) then from `.env` in CWD
- See `server/src/config.ts` for the full `Config` interface and all env vars
- Key env vars: `DATABASE_URL`, `PORT`, `HOST`, `PAPERCLIP_DEPLOYMENT_MODE`, `PAPERCLIP_SECRETS_PROVIDER`, `PAPERCLIP_STORAGE_PROVIDER`, `BETTER_AUTH_SECRET`, `SERVE_UI`
- `.env.example` at repo root shows minimal required vars (`DATABASE_URL`, `PORT`, `SERVE_UI`)
- Config file at `~/.paperclip/instances/<name>/config.json` supplements env vars (see `server/src/config-file.ts`)

**TypeScript:**
- Base config: `tsconfig.base.json` (ES2023, NodeNext, strict, sourceMap, declarationMap)
- Each package extends base config with its own `tsconfig.json`

**Build:**
- UI: Vite with `@vitejs/plugin-react` and `@tailwindcss/vite` (`ui/vite.config.ts`)
- Server: tsc only → `server/dist/`
- CLI: esbuild via `cli/esbuild.config.mjs` → `cli/dist/index.js` (executable)
- Packages: tsc → `dist/`

## Platform Requirements

**Development:**
- Node.js >=20, pnpm 9.15.4
- PostgreSQL not required locally (embedded-postgres bundled)
- UI dev server at port 5173, proxies `/api` to server at port 3100

**Production:**
- Docker image built from `Dockerfile` (multi-stage: base → deps → build → production)
- Base image: `node:lts-trixie-slim`
- System deps installed in container: `git`, `gh` (GitHub CLI), `ripgrep`, `python3`, `curl`, `wget`
- Global npm installs in production image: `@anthropic-ai/claude-code`, `@openai/codex`, `opencode-ai`
- Published to GitHub Container Registry (`ghcr.io/paperclipai/paperclip`)
- Supports `linux/amd64` and `linux/arm64`

---

*Stack analysis: 2026-04-03*
