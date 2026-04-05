# Human Agents for Paperclip

## What This Is

Extensión de Paperclip para soportar agentes humanos reales junto a los agentes de IA. Los dueños de organizaciones pueden invitar personas, asignarles tareas desde un dashboard, y los humanos las gestionan (cambian estado, adjuntan archivos, crean subtareas, reasignan a agentes IA). Flujo bidireccional humano ↔ IA dentro del mismo sistema de issues. Auto-approval en invites para onboarding sin fricción. Desplegado en producción como SaaS de tres capas: Vercel CDN (frontend), Easypanel VPS (backend), Supabase (PostgreSQL).

## Core Value

Un humano puede recibir, trabajar y completar tareas dentro de Paperclip exactamente como lo hace un agente de IA — sin fricción, desde la web app.

## Current Milestone: v1.2 Performance & Mobile Fix

**Goal:** Make every interaction feel instant via optimistic UI and aggressive caching, and fix cross-origin auth so mobile browsers can log in.

**Target features:**
- Optimistic UI updates for status changes, assignments, and mutations
- Aggressive client-side caching for lists and issue data
- WebSocket real-time optimization (reduce latency on live deployment)
- Mobile login fix (cross-origin cookie/session persistence on iOS/Android)

## Current State

**v1.0 shipped** (2026-04-04) — Human agents MVP: My Tasks, invite flow, task work surface, bidirectional handoff.
**v1.1 shipped** (2026-04-05) — Deployment & SaaS Readiness: Three-tier deployment (Vercel + Easypanel + Supabase), cross-origin auth, API hardening (Helmet + rate limiting + Redis cache), full E2E verification.

The platform is live and functional for multi-user testing. All 28 v1.1 requirements verified. The full invite → join → work → handoff → real-time cycle works end-to-end on the deployed stack.

**Known tech debt (v1.1):** 9 items — see `milestones/v1.1-MILESTONE-AUDIT.md`. Key items:
- WebSocket real-time updates are slow/laggy on live deployment
- File attachments use local disk (lost on container replacement — PROD-02 deferred)
- My Tasks page renders empty despite badge count (tasks accessible via Issues > Assigned to me)
- Vercel 404 on nested SPA routes like /PAC/dashboard

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

### Active

- [ ] Optimistic UI: status changes reflect immediately in the UI while server processes in background
- [ ] Optimistic UI: assignment/reassignment changes reflect immediately
- [ ] Client-side cache for issue lists — navigation feels instant on revisit
- [ ] WebSocket latency reduced — real-time updates arrive noticeably faster on live deployment
- [ ] Mobile login fix — users can log in and maintain session on iOS Safari and Android Chrome
- [ ] My Tasks page renders correctly (currently empty despite badge count)

### Out of Scope

- Notificaciones por email/push — MVP solo web app, el usuario entra y ve sus tareas
- Chat/mensajería entre miembros — no es un sistema de comunicación
- Time tracking — complejidad innecesaria para v1
- App móvil — web-first
- Roles granulares más allá de owner/member — simplificar para v1
- Row-Level Security (RLS) — future SaaS hardening, single-tenant testing first
- CI/CD pipeline — manual deploys sufficient for testing phase
- Kubernetes / container orchestration — Easypanel handles this

## Context

v1.1 shipped. Tech stack: React 19 + Vite + Tailwind v4 + shadcn/ui (frontend), Express 5 + Drizzle ORM (backend), BetterAuth (auth), Supabase PostgreSQL (database), Redis (caching + rate limiting). Deployed: Vercel CDN (frontend), Easypanel VPS (backend). 23 commits, +10,594 lines across 185 files for v1.1 milestone.

Performance is a known concern — WebSocket updates are slow, general UI responsiveness needs improvement. User wants to explore more aggressive caching and async patterns for v1.2.

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

---
*Last updated: 2026-04-05 after v1.2 milestone start*
