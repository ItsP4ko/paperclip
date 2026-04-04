# Human Agents for Paperclip

## What This Is

Extensión de Paperclip para soportar agentes humanos reales junto a los agentes de IA. Los dueños de organizaciones pueden invitar personas, asignarles tareas desde un dashboard, y los humanos las gestionan (cambian estado, adjuntan archivos, crean subtareas, reasignan a agentes IA). Flujo bidireccional humano ↔ IA dentro del mismo sistema de issues. Auto-approval en invites para onboarding sin fricción.

## Core Value

Un humano puede recibir, trabajar y completar tareas dentro de Paperclip exactamente como lo hace un agente de IA — sin fricción, desde la web app.

## Current State

**v1.0 shipped** (2026-04-04) — 4 phases, 11 plans, +1,468 lines across 26 files.
**Phase 05 complete** (2026-04-04) — Cross-origin code preparation: CORS middleware, BetterAuth cross-origin cookies, centralized API base URL, Vercel SPA rewrite. Codebase ready for Vercel→Railway split deployment.

Human agents are fully functional in `local_trusted` mode. The full invite → join → work → handoff cycle works end-to-end. Authenticated mode supports auto-approval for human joins.

**Known tech debt:** 9 items (see `milestones/v1.0-MILESTONE-AUDIT.md`). Key items:
- Members endpoint requires `users:manage_permissions` grant — non-owner humans get 403 in authenticated mode
- `resolveAssigneeName` helper exported but unused in production components
- TS2345 compile error in `confirmReassign` path (runtime correct)

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

### Active

<!-- v1.1 — Deployment & SaaS Readiness -->

- [~] Frontend deployed to CDN (Vercel) — cross-origin code prepared (Phase 05), deployment pending (Phase 06)
- [ ] Supabase as global database + Backend on Railway
- [ ] API Gateway protecting backend
- [ ] Redis cache layer for global database
- [ ] End-to-end multi-user testing (invite → join → work → handoff)

### Out of Scope

- Notificaciones por email/push — MVP solo web app, el usuario entra y ve sus tareas
- Chat/mensajería entre miembros — no es un sistema de comunicación
- Time tracking — complejidad innecesaria para v1
- App móvil — web-first
- Roles granulares más allá de owner/member — simplificar para v1

## Current Milestone: v1.1 Deployment & SaaS Readiness

**Goal:** Deploy Paperclip para testing real multi-usuario y sentar las bases de arquitectura SaaS (frontend en CDN, backend en Railway, BD global en Supabase, API Gateway, Redis cache).

**Target features:**
- Frontend en Vercel (CDN) separado del backend
- Backend en Railway con Dockerfile existente
- Supabase como BD global (reemplaza embedded-postgres para datos globales)
- API Gateway para proteger el backend
- Redis como capa de cache para la BD global
- Testing end-to-end del flujo completo: owner invita → usuario se registra → tareas → agentes → handoff

## Context

v1.0 shipped. Tech stack: React 19 + Vite + Tailwind v4 + shadcn/ui (frontend), Express 5 + Drizzle ORM (backend), BetterAuth (auth). No schema migrations were needed — the existing `assigneeUserId` on issues and `principalType: "user"` in memberships supported the full feature set.

## Constraints

- **Tech stack**: Mantener React 19 + Vite + Tailwind v4 + shadcn/ui — no introducir frameworks nuevos
- **Backend**: Express 5 + Drizzle ORM — extender rutas existentes, no reescribir
- **DB**: No se ejecutan migraciones automáticamente — todo SQL debe mostrarse al usuario
- **Compatibilidad**: No romper funcionalidad existente de agentes IA
- **Auth**: Usar better-auth existente, no agregar otro sistema de auth

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MVP sin notificaciones | Reducir scope inicial, el usuario entra a la web app proactivamente | ✓ Good — kept scope tight |
| Invitación por el owner | Control de acceso claro, un dueño por empresa | ✓ Good — simple access model |
| Reusar sistema de issues | No crear entidad separada para "tareas humanas", usar el mismo sistema | ✓ Good — zero migrations needed |
| Dashboard dedicado + filtro en Issues | Lo mejor de ambos mundos: vista rápida enfocada + acceso completo | ✓ Good — both surfaces functional |
| Flujo bidireccional humano ↔ IA | Un humano puede reasignar a un agente y viceversa | ✓ Good — with warning dialog for AI interruption |
| Auto-approval for human invites | Eliminar paso manual de aprobación para humanos | ✓ Good — frictionless onboarding |
| resolveAssigneePatch atomic utility | Prevenir 422 errors por envío parcial de campos assignee | ✓ Good — all assignment paths use it |
| Member permission gate in PATCH | Humanos solo pueden mutar sus propios issues (owner bypasses) | ✓ Good — simple, correct |
| Inline HumanActionBar in IssueDetail | No crear componente separado — inline section gated on assigneeUserId | ✓ Good — minimal footprint |
| InlineEntitySelector groups prop | Reusar componente existente para grouped pickers | ✓ Good — NewIssueDialog uses it; IssueProperties uses bespoke popover |

---
*Last updated: 2026-04-04 after Phase 05 (cross-origin code preparation) complete*
