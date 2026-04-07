---
phase: 16-api-hardening
plan: "02"
subsystem: server-routes
tags: [validation, zod, api-hardening, security, express5]
dependency_graph:
  requires: [16-01]
  provides: [mutation-route-validation, query-param-validation, nan-propagation-eliminated]
  affects:
    - server/src/routes/pipelines.ts
    - server/src/routes/knowledge.ts
    - server/src/routes/cost-recommendations.ts
    - server/src/routes/agents.ts
    - server/src/routes/routines.ts
    - server/src/middleware/validate.ts
tech_stack:
  added: []
  patterns: [zod-inline-schema, validate-middleware, validateQuery-middleware, z.coerce.number]
key_files:
  created: []
  modified:
    - server/src/routes/pipelines.ts
    - server/src/routes/knowledge.ts
    - server/src/routes/cost-recommendations.ts
    - server/src/routes/agents.ts
    - server/src/routes/routines.ts
    - server/src/middleware/validate.ts
decisions:
  - "Object.defineProperty used in validateQuery instead of direct req.query assignment — Express 5 defines req.query as a configurable getter; direct assignment throws TypeError in strict mode (ESM modules)"
  - "Inline Zod schemas per route file — no shared schema module; matches project pattern"
  - "z.coerce.number().int().min/max on query params — validates and coerces in one pass, eliminates NaN propagation"
  - "Manual guards (if (!name), if (!title||!content), if (!status||!includes(...))) removed — Zod makes them dead code"
metrics:
  duration: "10m"
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_modified: 6
requirements: [API-01, API-02]
---

# Phase 16 Plan 02: Route Validation (Mutation + Query) Summary

**One-liner:** Zod validate() on 8 mutation routes (3 files) and validateQuery() on 7 GET routes (4 files); NaN propagation eliminated; Express 5 req.query getter bug fixed in validate middleware.

## What Was Built

### Task 1: Zod schemas on mutation routes

**pipelines.ts** — Added 5 inline schemas and applied `validate()` middleware to all 5 mutation routes:
- `createPipelineSchema` on `POST /companies/:companyId/pipelines`
- `updatePipelineSchema` on `PATCH /companies/:companyId/pipelines/:pipelineId`
- `createPipelineStepSchema` on `POST /companies/:companyId/pipelines/:pipelineId/steps`
- `updatePipelineStepSchema` on `PATCH /companies/:companyId/pipelines/:pipelineId/steps/:stepId`
- `triggerPipelineRunSchema` on `POST /companies/:companyId/pipelines/:pipelineId/run`

Manual `if (!name || typeof name !== "string")` guards on create routes removed.

**knowledge.ts** — Added 2 body schemas (`createKnowledgeSchema`, `updateKnowledgeSchema`) and 2 query schemas (`knowledgeListQuerySchema`, `knowledgeSearchQuerySchema`):
- `validate(createKnowledgeSchema)` on `POST /companies/:companyId/knowledge`
- `validate(updateKnowledgeSchema)` on `PATCH /companies/:companyId/knowledge/:entryId`
- `validateQuery(knowledgeListQuerySchema)` on `GET /companies/:companyId/knowledge`
- `validateQuery(knowledgeSearchQuerySchema)` on `GET /companies/:companyId/knowledge/search`

Manual `if (!title || !content)` guard and `if (!q || !q.trim())` guard removed. `Number(req.query.limit)` and `Number(req.query.offset)` coercions removed.

**cost-recommendations.ts** — Added `updateCostRecommendationSchema` with `z.enum(["accepted","dismissed"])` and `costRecommendationsListQuerySchema`:
- `validate(updateCostRecommendationSchema)` on `PATCH /companies/:companyId/cost-recommendations/:id`
- `validateQuery(costRecommendationsListQuerySchema)` on `GET /companies/:companyId/cost-recommendations`

Manual `if (!status || !["accepted","dismissed"].includes(status))` guard and `as { status?: string }` type assertion removed.

### Task 2: validateQuery on GET routes with unguarded numeric params

**agents.ts** — Added `heartbeatEventsQuerySchema` and `logReadQuerySchema` with z.coerce.number():
- `validateQuery(heartbeatEventsQuerySchema)` on `GET /heartbeat-runs/:runId/events` — afterSeq, limit coerced + defaulted
- `validateQuery(logReadQuerySchema)` on `GET /heartbeat-runs/:runId/log` — offset, limitBytes coerced + defaulted
- `validateQuery(logReadQuerySchema)` on `GET /workspace-operations/:operationId/log` — same schema reused

All `Number(req.query.X)` calls with `Number.isFinite(X) ? X : default` fallback patterns removed.

**routines.ts** — Added `routineRunsQuerySchema` with z.coerce.number().default(50):
- `validateQuery(routineRunsQuerySchema)` on `GET /routines/:id/runs`

`Number(req.query.limit ?? 50)` with `Number.isFinite(limit) ? limit : 50` pattern removed.

### Bug fix in validate.ts (Rule 1 — auto-fixed)

While applying Task 2, the `routines-e2e.test.ts` test (which uses a real Express app with Supertest) returned 500 on the newly validated `GET /routines/:id/runs` endpoint.

Root cause: **Express 5 defines `req.query` as a configurable getter-only property** via `Object.defineProperty(req, 'query', { get: ... })`. In ESM strict mode, assigning to a getter-only property throws `TypeError: Cannot set property query of #<Object> which has only a getter`.

The original `validateQuery` implementation from Plan 01 (`req.query = schema.parse(req.query)`) silently failed in non-Express environments (unit tests with mock objects) but threw in Express 5's real request lifecycle.

Fix applied to `server/src/middleware/validate.ts`:
```typescript
// Before (throws in Express 5 strict mode):
req.query = schema.parse(req.query) as typeof req.query;

// After (works in Express 5):
const parsed = schema.parse(req.query);
Object.defineProperty(req, "query", {
  value: parsed as typeof req.query,
  writable: true,
  configurable: true,
  enumerable: true,
});
```

## Test Results

```
server/src/__tests__/validate-middleware.test.ts — 5/5 passed
server/src/__tests__/routines-e2e.test.ts        — 3/3 passed (was failing mid-task)
server/src/__tests__/routines-routes.test.ts     — 7/7 passed
server/src/__tests__/error-handler.test.ts       — 5/5 passed
All server tests                                  — 118 files, 653 passed, 1 skipped, 0 failed
```

## Verification

| Check | Result |
|-------|--------|
| `validate()` calls in pipelines.ts | 5 matches (5 mutation routes) |
| `validateQuery()` calls in knowledge.ts | 2 matches (list + search) |
| `validateQuery()` calls in agents.ts | 3 matches (events + 2x log) |
| `Number(req.query)` remaining in targeted files | 0 matches |
| Manual type guards removed | All 4 guards removed across 3 files |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 8b8dccdc | feat(16-02): add Zod schemas to mutation routes in pipelines, knowledge, cost-recommendations |
| 2    | b3c46a90 | feat(16-02): add validateQuery to GET routes with numeric params; fix Express 5 req.query assignment |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Express 5 req.query getter throws on direct assignment in strict mode**
- **Found during:** Task 2 — routines-e2e.test.ts returned 500 on GET /routines/:id/runs after validateQuery was added
- **Issue:** Express 5 defines `req.query` via `Object.defineProperty` with only a getter (no setter). In ESM strict mode, direct assignment `req.query = ...` throws `TypeError: Cannot set property query...`. Plan 01 unit tests (mock req objects) didn't catch this.
- **Fix:** Changed `validateQuery` to use `Object.defineProperty(req, "query", { value: parsed, writable: true, configurable: true, enumerable: true })` which replaces the getter with a plain value property.
- **Files modified:** `server/src/middleware/validate.ts`
- **Commit:** b3c46a90

## Self-Check: PASSED
