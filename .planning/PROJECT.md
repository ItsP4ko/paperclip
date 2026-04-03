# Human Agents for Paperclip

## What This Is

Extensión de Paperclip para soportar agentes humanos reales junto a los agentes de IA. Los dueños de organizaciones pueden invitar personas, asignarles tareas desde un dashboard, y los humanos las gestionan (cambian estado, adjuntan archivos, crean subtareas, reasignan a agentes IA). Flujo bidireccional humano ↔ IA dentro del mismo sistema de issues.

## Core Value

Un humano puede recibir, trabajar y completar tareas dentro de Paperclip exactamente como lo hace un agente de IA — sin fricción, desde la web app.

## Requirements

### Validated

<!-- Existing capabilities in the codebase that we build upon -->

- ✓ `assigneeUserId` ya existe en issues — se puede asignar a usuarios humanos — existing
- ✓ `company_memberships` con `principalType: "user"` — usuarios pertenecen a empresas — existing
- ✓ `membershipRole: "owner"` — concepto de dueño único ya existe — existing
- ✓ `assertAssignableUser` — validación de asignación a usuarios ya funciona — existing
- ✓ Permisos `tasks:assign` — control de quién puede asignar ya existe — existing
- ✓ Sistema de invites/joins con roles — existing
- ✓ Issues con estados (backlog/todo/in_progress/in_review/done) — existing
- ✓ Subtareas (parent issue) — existing
- ✓ Archivos adjuntos (assets) — existing

### Active

<!-- New scope to build -->

- [x] Dashboard "My Tasks" dedicado para usuarios humanos — Validated in Phase 01: identity-membership-my-tasks-foundation
- [x] Filtro "assigned to me" en la vista de Issues existente — Validated in Phase 01: identity-membership-my-tasks-foundation
- [x] Un humano puede cambiar el estado de sus tareas asignadas — Validated in Phase 02: task-work-surface
- [x] Un humano puede adjuntar archivos a una tarea — Validated in Phase 02: task-work-surface
- [x] Un humano puede crear subtareas dentro de una tarea — Validated in Phase 02: task-work-surface
- [x] Un humano puede reasignar una tarea a un agente de IA — Validated in Phase 02: task-work-surface
- [x] El dueño de la empresa puede invitar usuarios humanos por email/link — Validated in Phase 01: identity-membership-my-tasks-foundation
- [ ] El dueño puede asignar tareas a cualquier miembro (humano o IA) desde el dashboard
- [x] Los miembros humanos aparecen en el org chart / listado de la empresa — Validated in Phase 01: identity-membership-my-tasks-foundation
- [ ] Vista de equipo: ver qué tiene asignado cada miembro (humano + IA)

### Out of Scope

- Notificaciones por email/push — MVP solo web app, el usuario entra y ve sus tareas
- Chat/mensajería entre miembros — no es un sistema de comunicación
- Time tracking — complejidad innecesaria para v1
- App móvil — web-first
- Roles granulares más allá de owner/member — simplificar para v1

## Context

Paperclip ya tiene la infraestructura base: `assigneeUserId` en issues, membresías de empresa con `principalType: "user"`, y validación de asignación. Lo que falta es principalmente UI y flujos de interacción para que los humanos puedan trabajar cómodamente dentro del sistema.

El backend ya soporta la mayoría de operaciones necesarias (asignar issues a users, crear subtareas, adjuntar assets). El trabajo es mayormente frontend + ajustes de permisos + la experiencia del usuario humano.

La autenticación existe via better-auth. El sistema de invites/joins ya funciona. El deployment mode `authenticated` ya maneja multi-usuario.

## Constraints

- **Tech stack**: Mantener React 19 + Vite + Tailwind v4 + shadcn/ui — no introducir frameworks nuevos
- **Backend**: Express 5 + Drizzle ORM — extender rutas existentes, no reescribir
- **DB**: No se ejecutan migraciones automáticamente — todo SQL debe mostrarse al usuario
- **Compatibilidad**: No romper funcionalidad existente de agentes IA
- **Auth**: Usar better-auth existente, no agregar otro sistema de auth

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MVP sin notificaciones | Reducir scope inicial, el usuario entra a la web app proactivamente | — Pending |
| Invitación por el owner | Control de acceso claro, un dueño por empresa | — Pending |
| Reusar sistema de issues | No crear entidad separada para "tareas humanas", usar el mismo sistema | — Pending |
| Dashboard dedicado + filtro en Issues | Lo mejor de ambos mundos: vista rápida enfocada + acceso completo | — Pending |
| Flujo bidireccional humano ↔ IA | Un humano puede reasignar a un agente y viceversa | — Pending |

---
*Last updated: 2026-04-03 after Phase 02: task-work-surface complete*
