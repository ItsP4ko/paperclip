# Human Agents for Paperclip

## What This Is

Extensión de Paperclip para soportar agentes humanos reales junto a los agentes de IA. Los dueños de organizaciones pueden invitar personas, asignarles tareas desde un dashboard, y los humanos las gestionan (cambian estado, adjuntan archivos, crean subtareas, reasignan a agentes IA). Flujo bidireccional humano ↔ IA dentro del mismo sistema de issues. Auto-approval en invites para onboarding sin fricción. Desplegado en producción como SaaS de tres capas: Vercel CDN (frontend), Easypanel VPS (backend), Supabase (PostgreSQL). UI reactiva con optimistic updates, caché agresivo de 2 min, y WebSocket confiable con heartbeat y reconexión automática.

## Core Value

Un humano puede recibir, trabajar y completar tareas dentro de Paperclip exactamente como lo hace un agente de IA — sin fricción, desde la web app.

## Current Milestone: v1.3 Security Hardening

**Goal:** Endurecer la seguridad de la app en cuatro ejes — auth, API, frontend, y visibilidad — preparando el stack para Cloudflare Pages.

**Target features:**
- Auth hardening: sesiones activas (ver + revocar por dispositivo) + brute-force login protection
- API hardening: validación Zod en todos los endpoints + errores seguros sin stack traces + CSRF protection
- Frontend / XSS: CSP estricta + sanitización de contenido renderizado + headers compatibles con Cloudflare Pages
- Audit logs: panel owner-only con logs de acciones sensibles (logins, invites, asignaciones, cambios de rol)

## Current State

**v1.0 shipped** (2026-04-04) — Human agents MVP: My Tasks, invite flow, task work surface, bidirectional handoff.
**v1.1 shipped** (2026-04-05) — Deployment & SaaS Readiness: Three-tier deployment (Vercel + Easypanel + Supabase), cross-origin auth, API hardening (Helmet + rate limiting + Redis cache), full E2E verification.
**v1.2 shipped** (2026-04-06) — Performance & Mobile Fix: Optimistic UI, aggressive caching, mobile auth (iOS Safari + Android Chrome), WebSocket heartbeat + reconnect cache recovery.

The platform is live and functional for multi-user testing. All v1.2 requirements verified. The full invite → join → work → handoff → real-time cycle works end-to-end on the deployed stack. Mobile users can authenticate via bearer token strategy on both iOS Safari and Android Chrome.

**Tech stack:** React 19 + Vite + Tailwind v4 + shadcn/ui (frontend), Express 5 + Drizzle ORM (backend), BetterAuth (auth with bearer plugin), Supabase PostgreSQL (database), Redis (caching + rate limiting). Deployed: Vercel CDN (frontend), Easypanel VPS (backend).

**Known tech debt (v1.2):** 9 items — see `milestones/v1.2-MILESTONE-AUDIT.md`. Key deferred items:
- File attachments use local disk (lost on container replacement — future: S3/Supabase Storage)
- Android Chrome end-to-end manually unverified (code path identical to iOS Safari)
- Server doesn't echo client WS ping — idle sessions reconnect every ~22s unnecessarily (future: add server ping echo)

## Requirements

### Validated

- ✓ `assigneeUserId` ya existe en issues — se puede asignar a usuarios humanos — existing
- ✓ `company_memberships` con `principalType: "user"` — usuarios pertenecen a empresas — existing
- ✓ `membershipRole: "owner"` — concepto de dueño único ya existe — existing
- ✓ `assertAssignableUser` — validación de asignación a usuarios ya funciona — existing
- ✓ Permisos `tasks:assign` — control de quién puede asignar ya existe — existing
- ✓ Sistema de invites/joins con roles — existing
- ✓ Issues con estados (backlog/todo/in_progress/in_review/done) — existing
- ✓ Subtareas (parent issue) — existing
- ✓ Archivos adjuntos (assets) — existing
- ✓ Dashboard "My Tasks" dedicado para usuarios humanos — v1.0
- ✓ Filtro "assigned to me" en la vista de Issues existente — v1.0
- ✓ Un humano puede cambiar el estado de sus tareas asignadas — v1.0
- ✓ Un humano puede adjuntar archivos a una tarea — v1.0
- ✓ Un humano puede crear subtareas dentro de una tarea — v1.0
- ✓ Un humano puede reasignar una tarea a un agente de IA — v1.0
- ✓ El dueño de la empresa puede invitar usuarios humanos por email/link — v1.0
- ✓ El dueño puede asignar tareas a cualquier miembro (humano o IA) desde el dashboard — v1.0
- ✓ Los miembros humanos aparecen en el org chart / listado de la empresa — v1.0
- ✓ Vista de equipo: ver qué tiene asignado cada miembro (humano + IA) — v1.0
- ✓ Frontend deployed to CDN (Vercel) — v1.1
- ✓ Supabase as global database + Backend on Easypanel VPS — v1.1
- ✓ Redis cache layer for global database — v1.1
- ✓ End-to-end multi-user testing (invite → join → work → handoff) — v1.1
- ✓ Cross-origin auth (CORS, SameSite cookies, secret validation) — v1.1
- ✓ API hardening (Helmet security headers, rate limiting) — v1.1
- ✓ Optimistic UI: status/assignment/subtask changes reflect immediately with rollback on failure — v1.2
- ✓ WS isMutating guard: real-time events don't overwrite in-flight optimistic mutations — v1.2
- ✓ Issue lists cached 2 min — navigating back shows data instantly without spinner — v1.2
- ✓ Issue detail cached 2 min — reopening a visited issue is instant — v1.2
- ✓ My Tasks page renders assigned issues correctly (empty-render bug fixed) — v1.2
- ✓ Cache invalidates correctly after any mutation — v1.2
- ✓ iOS Safari login and authenticated session (bearer token strategy) — v1.2
- ✓ Android Chrome login and authenticated session (same bearer code path) — v1.2
- ✓ WebSocket user session auth via ?token= query param — v1.2
- ✓ Nested SPA routes on Vercel load correctly without 404 — v1.2
- ✓ Dead WebSocket connections detected within 22s and reconnected automatically — v1.2
- ✓ perMessageDeflate compression disabled on WS server — v1.2
- ✓ Cache recovery after WebSocket reconnect (issue lists + detail + sidebar + dashboard) — v1.2

### Active

<!-- v1.3 Security Hardening — defined 2026-04-05 -->

- [ ] Auth hardening: sesiones activas (ver + revocar) + brute-force protection
- [ ] API hardening: validación Zod + errores seguros + CSRF protection
- [ ] Frontend / XSS: CSP estricta + sanitización + headers Cloudflare Pages-compatible
- [ ] Audit logs: panel owner-only con logs de acciones sensibles

### Out of Scope

- Notificaciones por email/push — MVP solo web app, el usuario entra y ve sus tareas
- Chat/mensajería entre miembros — no es un sistema de comunicación
- Time tracking — complejidad innecesaria para v1
- App móvil — web-first
- Roles granulares más allá de owner/member — simplificar para v1
- Row-Level Security (RLS) — future SaaS hardening, single-tenant testing first
- CI/CD pipeline — manual deploys sufficient for testing phase
- Kubernetes / container orchestration — Easypanel handles this
- Cloud file storage (S3/Supabase Storage) — deferred, local disk sufficient for current volume

## Context

v1.2 shipped. Tech stack: React 19 + Vite + Tailwind v4 + shadcn/ui (frontend), Express 5 + Drizzle ORM (backend), BetterAuth with bearer plugin (auth), Supabase PostgreSQL (database), Redis (caching + rate limiting). Deployed: Vercel CDN (frontend), Easypanel VPS (backend). v1.2 added 11,531 lines across 99 files over 2 days.

Performance is significantly improved — optimistic UI, 2-minute cache, and WS heartbeat/reconnect are all live. Mobile auth works on iOS Safari (human-verified) and should work on Android Chrome (same code path, not device-tested).

## Constraints

- **Tech stack**: Mantener React 19 + Vite + Tailwind v4 + shadcn/ui — no introducir frameworks nuevos
- **Backend**: Express 5 + Drizzle ORM — extender rutas existentes, no reescribir
- **DB**: No se ejecutan migraciones automáticamente — todo SQL debe mostrarse al usuario
- **Compatibilidad**: No romper funcionalidad existente de agentes IA
- **Auth**: Usar better-auth existente, no agregar otro sistema de auth
- **Deployment**: Three-tier (Vercel + Easypanel + Supabase) — no cambiar infraestructura

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MVP sin notificaciones | Reducir scope inicial, el usuario entra a la web app proactivamente | ✓ Good — kept scope tight |
| Invitación por el owner | Control de acceso claro, un dueño por empresa | ✓ Good — simple access model |
| Reusar sistema de issues | No crear entidad separada para "tareas humanas", usar el mismo sistema | ✓ Good — zero migrations needed |
| Dashboard dedicado + filtro en Issues | Lo mejor de ambos mundos: vista rápida enfocada + acceso completo | ✓ Good — both surfaces functional |
| Flujo bidireccional humano ↔ IA | Un humano puede reasignar a un agente y viceversa | ✓ Good — with warning dialog for AI interruption |
| Auto-approval for human invites | Eliminar paso manual de aprobación para humanos | ✓ Good — frictionless onboarding |
| Cross-origin code before infrastructure | Phase 5 isolated code changes from cloud provisioning | ✓ Good — prevented debugging CORS + infra simultaneously |
| Easypanel over Railway | Switched from Railway to user's existing Easypanel VPS | ✓ Good — leveraged existing infrastructure |
| Session-mode Supabase pooler (port 5432) | Drizzle prepared statements break on transaction-mode (port 6543) | ✓ Good — stable connection |
| Redis optional (graceful degradation) | Server starts without REDIS_URL, falls back to in-memory | ✓ Good — no hard dependency |
| Hardening after E2E verification | Rate limits interfere with auth/CORS debugging | ✓ Good — clean E2E baseline first |
| Gap closure phase for audit gaps | Phase 9 addressed rate-limit bug + manual E2E verification | ✓ Good — all 28 requirements closed |
| isMutating guard for WS invalidation | Suppresses issue list/detail invalidations during in-flight mutations only; non-optimistic keys always invalidate | ✓ Good — prevents UI flicker without blocking activity/comment updates |
| Per-query staleTime override (not global) | 120s staleTime on issue list/detail only; polling queries and global default unchanged | ✓ Good — targeted, no regressions |
| listAssignedToMe outside isMutating guard | Filtered list not touched by optimistic writes; safe to always invalidate alongside other list queries | ✓ Good — fixed My Tasks empty-render |
| Bearer() plugin strategy for mobile auth | Solves HTTP and WS auth in one pass; cookie-only flows unaffected | ✓ Good — iOS Safari verified, same path for Android |
| encodeURIComponent() for WS token param | BetterAuth signed tokens contain URL-special chars (., +, =) | ✓ Good — prevents token corruption in query string |
| vercel.json routes + filesystem handle | rewrites cannot coexist with routes; filesystem handle required for static assets | ✓ Good — SPA routing fixed, assets still served |
| ESM import for ws package | vitest vi.mock cannot intercept createRequire(); ESM import goes through vitest module system | ✓ Good — unit test mock interception works |
| scheduleHeartbeat inside connect() closure | nextSocket must be captured in closure; clearHeartbeat stays at useEffect level | ✓ Good — no timer leaks |
| reconnectAttempt > 0 guard for cache invalidation | Initial connect should not flush cache; only true reconnects need recovery | ✓ Good — no spurious invalidations on first load |

---
*Last updated: 2026-04-05 after v1.3 milestone started*
