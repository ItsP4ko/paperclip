# Phase 16: API Hardening - Research

**Researched:** 2026-04-06
**Domain:** Express 5 middleware, Zod validation, error handler hardening, CSRF documentation
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | All mutation routes without validation have Zod schemas (`validate()` middleware) | Existing `validate()` middleware works; routes identified without it; schemas must be added to shared validators or inline |
| API-02 | GET routes with relevant query params have `validateQuery()` with `z.coerce.*` | `validateQuery` does not exist yet; must be created in `server/src/middleware/validate.ts` alongside `validate`; `z.coerce.number()` handles string-to-number conversion |
| API-03 | Production 5xx responses do not expose stack traces or internal details | Current `errorHandler` already returns `{"error":"Internal server error"}` for unknown errors and HttpError 5xx; ZodError returns 400 — no stack leak found. Need test coverage and confirmation no path exposes stack |
| API-04 | CSRF non-implementation decision is documented in code with technical justification | Currently documented only in REQUIREMENTS.md Out-of-Scope table; needs a code comment in `middleware/auth.ts` or `app.ts` referencing bearer token architecture + OWASP |
</phase_requirements>

## Summary

Phase 16 hardens the existing Express 5 API surface with input validation and error-response discipline. The infrastructure is already partially in place: a `validate(schema)` middleware exists in `server/src/middleware/validate.ts`, the global `errorHandler` in `server/src/middleware/error-handler.ts` already catches `ZodError` → 400 and unknown errors → generic 500, and Zod 3.25 is installed. The work in this phase is primarily additive: create a `validateQuery()` counterpart, write Zod schemas for the unvalidated mutation routes, apply `z.coerce.*` to numeric query params in the GET routes that need it, and add a code comment for the CSRF decision.

No breaking changes are expected. All routes are Express 5 async handlers (Express 5.2.1 installed), so unhandled promise rejections are forwarded to `errorHandler` automatically — the error-response path works correctly already.

**Primary recommendation:** Add `validateQuery` to the existing validate.ts, create inline schemas or shared-validator entries for the six unvalidated mutation route groups, apply validateQuery to the five GET route groups with unguarded numeric params, and add a single CSRF comment to `middleware/auth.ts`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25.76 (installed) | Schema declaration, parse/coerce | Already in use project-wide; shared validators package uses it |
| express | 5.2.1 (installed) | HTTP framework | Project standard; v5 auto-forwards async errors to error handler |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | (installed) | Unit tests for middleware and routes | All test files in `server/src/__tests__/` use vitest + supertest |
| supertest | (installed) | HTTP integration tests | Used in login-rate-limit.test.ts, board-mutation-guard.test.ts, etc. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `schema.parse()` in validate | `schema.safeParse()` + manual 400 | `parse()` throws ZodError caught by errorHandler — fewer lines, consistent pattern already in use |
| Inline schemas per route file | Shared validators package | Inline is fine for route-local schemas; shared validators already used for cross-package schemas (UI uses them too) |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
server/src/
├── middleware/
│   └── validate.ts          # Add validateQuery() here alongside validate()
├── routes/
│   ├── pipelines.ts         # Add createPipelineSchema, updatePipelineSchema inline
│   ├── knowledge.ts         # Add createKnowledgeSchema, updateKnowledgeSchema inline
│   ├── runners.ts           # runner/jobs/:runId/claim has no body — no schema needed
│   └── access.ts            # invites/revoke, join-requests approve/reject — no body fields
└── __tests__/
    ├── validate-middleware.test.ts   # New: covers validate() and validateQuery()
    └── error-handler.test.ts        # Existing: extend for 5xx body shape
```

### Pattern 1: validate() — existing body middleware
**What:** Synchronous middleware that calls `schema.parse(req.body)` and replaces `req.body` with the parsed (typed) result. ZodError propagates to errorHandler → 400.
**When to use:** Every POST/PUT/PATCH route with a meaningful body.
**Example:**
```typescript
// server/src/middleware/validate.ts (current)
import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
}
```

### Pattern 2: validateQuery() — new query param middleware
**What:** Parallel to `validate()` but parses `req.query`. Uses `z.coerce.*` so numeric strings (`"50"`) coerce to numbers (`50`). Replaces `req.query` with typed result.
**When to use:** Any GET route that reads numeric (or enum) query params currently doing `Number(req.query.limit)` without guard.
**Example:**
```typescript
// server/src/middleware/validate.ts (to add)
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.query = schema.parse(req.query) as typeof req.query;
    next();
  };
}
```

### Pattern 3: z.coerce.number() for pagination params
**What:** `z.coerce.number().int().min(1).max(200).optional()` coerces `"50"` → `50` and rejects `"abc"` with a ZodError.
**When to use:** All `limit` / `offset` / `page` query params.
**Example:**
```typescript
const paginationQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
```

### Pattern 4: Inline schemas for route-local mutations
**What:** Define the Zod schema at the top of the route file (not in shared validators) when the schema is not needed by the UI package.
**When to use:** Routes like pipelines.ts and knowledge.ts whose schemas are not currently in `packages/shared/src/validators/`.
**Example:**
```typescript
// server/src/routes/pipelines.ts
const createPipelineSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  status:      z.string().optional(),
});
```

### Anti-Patterns to Avoid
- **Manual `Number(req.query.limit)` without NaN guard:** `Number("abc")` returns `NaN` silently; if passed to a DB query it can cause a 500 or invalid result. Use `z.coerce.number()` instead.
- **`schema.safeParse()` + custom 400 response in middleware:** Creates inconsistent error shapes. Stick with `schema.parse()` — errorHandler normalizes the ZodError.
- **Putting CSRF comment only in REQUIREMENTS.md:** Must be in source code where a future developer reviews the auth/middleware layer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Numeric query coercion | `parseInt(x, 10) || default` | `z.coerce.number()` in validateQuery | `parseInt` silently returns NaN/default; coerce throws a typed ZodError |
| Error body scrubbing | Conditional `if (isDev)` branches | Existing errorHandler pattern (already correct) | errorHandler already never exposes stack in 500 response body |
| CSRF token generation | Any custom CSRF middleware | Nothing — do NOT implement | Bearer token architecture is immune by design; adding CSRF breaks mobile/agent clients |

**Key insight:** The error handling infrastructure is already production-safe. Phase 16 is about adding schema coverage to the input validation layer, not rebuilding the error layer.

## Common Pitfalls

### Pitfall 1: validate() uses schema.parse() — ZodError is thrown synchronously in middleware
**What goes wrong:** Some developers expect Express to handle sync throws from middleware automatically only in async handlers. In Express 5, sync throws from regular (non-async) middleware ARE passed to next(err).
**Why it happens:** Express 4 required explicit `try/catch` in sync middleware; Express 5 does not.
**How to avoid:** No change needed — current pattern works. Do not add try/catch to validate().
**Warning signs:** If ZodError produces a 500 instead of 400, errorHandler may not be registered; confirm `app.use(errorHandler)` is last in app.ts (it is, line 339).

### Pitfall 2: validateQuery replaces req.query with a plain object
**What goes wrong:** Express sets `req.query` via a getter backed by `qs` parsing. Replacing it with a Zod-parsed plain object works for reading values but loses the qs prototype chain.
**Why it happens:** Typing `req.query = schema.parse(req.query) as typeof req.query` uses a type assertion but actually does replace the object at runtime.
**How to avoid:** This is the correct approach — same pattern as `validate()` replacing `req.body`. The cast `as typeof req.query` satisfies TypeScript; runtime behavior is correct.
**Warning signs:** If `req.query.someParam` is undefined after validateQuery, the schema must include `z.string().optional()` for that key.

### Pitfall 3: z.coerce strips unknown query params
**What goes wrong:** Zod strict schemas (`.strict()`) reject unknown keys. Express passes many query params that schemas don't declare.
**Why it happens:** If `z.object({limit: ...}).strict()` is used and the request has `?limit=10&agentId=abc`, it fails because `agentId` is unknown.
**How to avoid:** Use `z.object({...})` without `.strict()` (default passthrough for query schemas) or use `.passthrough()` explicitly.
**Warning signs:** Legitimate requests failing with 400 "unrecognized_keys" error.

### Pitfall 4: validate() does NOT wrap with try/catch — unhandled sync exceptions
**What goes wrong:** In Express 5, if `schema.parse()` throws synchronously inside a non-async middleware, it IS caught. But if a future developer wraps validate in async for some reason, they must use `next(err)` or Express 5's automatic forwarding.
**Why it happens:** Confusion between Express 4 and 5 error propagation rules.
**How to avoid:** Keep validate() as a sync function (no async). Express 5 handles sync throws.
**Warning signs:** Unhandled rejection warnings in logs from middleware.

### Pitfall 5: Routes with no body still called "unvalidated"
**What goes wrong:** Some POST routes have no meaningful body (e.g., `/runner/jobs/:runId/claim`, `/issues/:id/read`, `/issues/:id/release`, `/invites/:inviteId/revoke`). These don't need `validate()`.
**Why it happens:** Requirement API-01 says "mutation routes without validation" — this means routes that accept a meaningful payload but don't validate it.
**How to avoid:** Apply validate() only where a body schema makes sense. Routes that act as signals (no body) or rely only on path params are fine without validate().
**Warning signs:** Adding `validate(z.object({}))` to no-body routes — provides zero value.

### Pitfall 6: Error handler exposes HttpError.message for 5xx
**What goes wrong:** The current errorHandler sends `err.message` verbatim for HttpError with status >= 500. If any code does `throw new HttpError(500, dbConnection.toString())` the internal detail leaks.
**Why it happens:** HttpError is developer-controlled; the risk is in what message is passed.
**How to avoid:** Audit 5xx HttpError throws in the codebase. For unknown errors (catch-all path), errorHandler already returns the generic message. The risk is developer-created HttpError(500) with sensitive messages — this is LOW risk given current usage but should be verified.
**Warning signs:** `res.json({ error: err.message })` in errorHandler's HttpError >=500 branch — already present but message is developer-controlled.

## Code Examples

Verified patterns from official sources and codebase inspection:

### validateQuery middleware (new — to add to validate.ts)
```typescript
// server/src/middleware/validate.ts
import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.query = schema.parse(req.query) as typeof req.query;
    next();
  };
}
```

### Pipeline mutation schemas (inline in pipelines.ts)
```typescript
import { z } from "zod";
import { validate } from "../middleware/validate.js";

const createPipelineSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  status:      z.string().optional(),
});

const updatePipelineSchema = z.object({
  name:        z.string().min(1).optional(),
  description: z.string().optional(),
  status:      z.string().optional(),
});

const createPipelineStepSchema = z.object({
  name:      z.string().min(1),
  agentId:   z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  position:  z.number().optional(),
  config:    z.record(z.unknown()).optional(),
});

const updatePipelineStepSchema = createPipelineStepSchema.partial();

const triggerPipelineRunSchema = z.object({
  projectId:   z.string().optional(),
  triggeredBy: z.string().optional(),
});
```

### Knowledge mutation schemas (inline in knowledge.ts)
```typescript
const createKnowledgeSchema = z.object({
  title:      z.string().min(1),
  content:    z.string().min(1),
  agentId:    z.string().optional(),
  category:   z.string().optional(),
  tags:       z.array(z.string()).optional(),
  pinned:     z.boolean().optional(),
  sourceType: z.string().optional(),
  sourceRef:  z.string().optional(),
  metadata:   z.record(z.unknown()).optional(),
});

const updateKnowledgeSchema = createKnowledgeSchema.partial();
```

### Pagination query schema (reusable)
```typescript
// Inline per-route or extracted to a shared location
const paginationQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
```

### CSRF comment location (middleware/auth.ts, near top of actorMiddleware)
```typescript
// CSRF PROTECTION: Not implemented by design.
// This server uses bearer token authentication (Authorization: Bearer <token>).
// Bearer tokens are never sent automatically by browsers — they require explicit
// JavaScript to attach to requests. This means cross-site request forgery is
// impossible without the attacker also having the token.
// Reference: OWASP CSRF Prevention Cheat Sheet — "Use of Custom Request Headers"
// (https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
// Adding CSRF tokens would break mobile clients and AI agent integrations with zero
// security benefit.
export function actorMiddleware(...)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Number(req.query.limit)` (NaN-unsafe) | `z.coerce.number()` in validateQuery | Phase 16 | Sends 400 instead of silently propagating NaN to DB queries |
| Manual `if (!name)` guards in route body | `validate(schema)` middleware | Already in use for most routes | Consistent 400 shape, less code in route handlers |
| Express 4 try/catch in every async handler | Express 5 automatic error forwarding | Express 5.2.1 installed | No try/catch needed in async route handlers |

**Deprecated/outdated:**
- Manual `Number(req.query.x)` without guard: used in `knowledge.ts`, `cost-recommendations.ts`, `audit.ts` (partially guarded), `routines.ts`, `agents.ts` — replace with `validateQuery` + `z.coerce.number()`

## Inventory: Routes Needing validate()

Routes with mutation methods and no `validate()` call, where a meaningful body exists:

| File | Route | Method | Body fields used | Action |
|------|-------|--------|-----------------|--------|
| pipelines.ts | `/companies/:companyId/pipelines` | POST | `name`, `description`, `status` | Add inline schema |
| pipelines.ts | `/companies/:companyId/pipelines/:id` | PATCH | `name`, `description`, `status` | Add inline schema |
| pipelines.ts | `/companies/:companyId/pipelines/:id/steps` | POST | `name`, `agentId`, `dependsOn`, `position`, `config` | Add inline schema |
| pipelines.ts | `/companies/:companyId/pipelines/:id/steps/:stepId` | PATCH | same as above | Add inline schema |
| pipelines.ts | `/companies/:companyId/pipelines/:id/run` | POST | `projectId`, `triggeredBy` | Add inline schema |
| knowledge.ts | `/companies/:companyId/knowledge` | POST | `title`, `content`, `agentId`, etc. | Add inline schema |
| knowledge.ts | `/companies/:companyId/knowledge/:entryId` | PATCH | partial knowledge fields | Add inline schema |
| cost-recommendations.ts | `/companies/:companyId/cost-recommendations/:id` | PATCH | `status` | Has manual guard already; add schema for consistency |

Routes with POST but no meaningful body (no validate needed):
- `/runner/jobs/:runId/claim` — no body
- `/issues/:id/read`, `/issues/:id/release`, `/issues/:id/inbox-archive` — no body
- `/invites/:inviteId/revoke` — no body
- `/agents/:id/pause`, `/agents/:id/resume`, `/agents/:id/terminate` — no body
- `/companies/:companyId/cost-recommendations/generate` — no body

## Inventory: GET Routes Needing validateQuery()

| File | Route | Params at risk | Action |
|------|-------|----------------|--------|
| knowledge.ts | `/companies/:companyId/knowledge` | `limit`, `offset` | Add validateQuery with z.coerce.number() |
| knowledge.ts | `/companies/:companyId/knowledge/search` | `limit` | Add validateQuery |
| cost-recommendations.ts | `/companies/:companyId/cost-recommendations` | `limit`, `offset` | Add validateQuery |
| agents.ts | log-read routes (~3 routes) | `limit`, `offset`, `limitBytes` | Add validateQuery |
| routines.ts | routine logs route | `limit` | Add validateQuery |

Routes with existing adequate guards (no change needed):
- `audit.ts` `/companies/:companyId/audit/timeline` — already has `Number.isFinite` guard + 400
- `plugins.ts` — uses `parseInt(...) || default` with Math.min/max clamping (acceptable)

## Open Questions

1. **cost-recommendations PATCH already has manual guard**
   - What we know: The route checks `!["accepted", "dismissed"].includes(status)` and throws `badRequest()` manually
   - What's unclear: Whether adding `validate(schema)` is redundant or provides value
   - Recommendation: Add schema anyway for consistency — schema replaces the manual guard and is the project pattern

2. **HttpError 5xx message exposure**
   - What we know: `errorHandler` sends `err.message` for HttpError with status >= 500, not the generic message
   - What's unclear: Whether any current code path creates `new HttpError(500, <sensitive-string>)`
   - Recommendation: Quick grep of all `HttpError(5` in codebase during planning phase; likely fine but worth documenting

3. **agents.ts log-read routes — exact file/line**
   - What we know: Lines 2288-2344 use `Number(req.query.limit)`, `Number(req.query.offset)`, `Number(req.query.limitBytes)` without guards
   - What's unclear: Whether these routes are internal-only (runner-only) or user-facing
   - Recommendation: Apply validateQuery regardless; internal-only routes still benefit from NaN protection

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (vitest.config.ts in `server/`) |
| Config file | `server/vitest.config.ts` |
| Quick run command | `pnpm --filter @paperclipai/server test --reporter=verbose --run src/__tests__/validate-middleware.test.ts` |
| Full suite command | `pnpm --filter @paperclipai/server test --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | POST with bad body returns 400 with ZodError details | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/validate-middleware.test.ts` | ❌ Wave 0 |
| API-01 | POST with valid body passes through | unit | same | ❌ Wave 0 |
| API-02 | GET with non-numeric limit returns 400 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/validate-middleware.test.ts` | ❌ Wave 0 |
| API-02 | GET with numeric string limit coerces to number | unit | same | ❌ Wave 0 |
| API-03 | Unhandled exception returns `{"error":"Internal server error"}` with no stack | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/error-handler.test.ts` | ✅ exists |
| API-03 | 500 response body contains no file paths or stack trace | unit | same (extend existing test) | ✅ exists (extend) |
| API-04 | CSRF comment exists in middleware/auth.ts | smoke/grep | `grep -n "CSRF" server/src/middleware/auth.ts` | ❌ Wave 0 (manual check) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @paperclipai/server test --run src/__tests__/validate-middleware.test.ts src/__tests__/error-handler.test.ts`
- **Per wave merge:** `pnpm --filter @paperclipai/server test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/src/__tests__/validate-middleware.test.ts` — covers API-01 (validate body) and API-02 (validateQuery coercion)
- [ ] Extend `server/src/__tests__/error-handler.test.ts` — add test asserting 500 body has no stack/path fields (API-03)

*(No new framework install needed — vitest + supertest already installed)*

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `server/src/middleware/validate.ts` — existing validate() pattern
- Codebase inspection: `server/src/middleware/error-handler.ts` — current 5xx handling behavior
- Codebase inspection: `server/src/app.ts` — Express version 5.2.1, errorHandler mount position
- Codebase inspection: `server/src/routes/pipelines.ts` — unvalidated mutation routes identified
- Codebase inspection: `server/src/routes/knowledge.ts` — unvalidated mutations + unguarded numeric params
- Codebase inspection: `server/src/routes/cost-recommendations.ts` — unguarded numeric params
- Codebase inspection: `server/src/routes/agents.ts` — unguarded numeric params in log routes
- Codebase inspection: `server/src/middleware/auth.ts` — CSRF comment target location
- `.planning/REQUIREMENTS.md` — CSRF decision documented in Out of Scope table

### Secondary (MEDIUM confidence)
- Zod v3 docs: `z.coerce.number()` coerces string `"50"` → `50`, rejects `"abc"` with ZodError
- Express 5 docs: async route handlers — unhandled rejections forwarded to error handler automatically

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified from installed node_modules
- Architecture: HIGH — based on direct codebase inspection; existing patterns confirmed
- Pitfalls: HIGH — based on codebase reading (NaN propagation, Express 5 error forwarding confirmed)

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable stack)
