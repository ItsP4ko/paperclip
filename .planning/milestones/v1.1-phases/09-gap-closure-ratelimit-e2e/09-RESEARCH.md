# Phase 9: Gap Closure — Rate-Limit Fix & E2E Completion — Research

**Researched:** 2026-04-05
**Domain:** Express middleware path semantics, manual E2E verification, documentation hygiene
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| E2E-04 | Invited user can change task status, attach files, create subtasks | Status change + subtask already verified (screenshots 06, 08, 09). File attach requires manual browser test on live deployment — no automation path available via Chrome DevTools MCP. |
| E2E-05 | User can reassign a task to an AI agent (bidirectional handoff works) | Already substantively verified: screenshot 10 shows AI Agents section with 14 agents, CEO agent selectable. Only doc update needed (REQUIREMENTS.md checkbox + SUMMARY frontmatter). |
| E2E-06 | Real-time updates (WebSocket) work across the deployed stack | WebSocket wiring is correct end-to-end (LiveUpdatesProvider, getWsHost, server WS handler all connected). Needs manual two-window test on live deployment to produce evidence. |
| HARD-01 (integration fix) | Rate limiting middleware protects API endpoints — health check excluded | Bug confirmed: `req.path === "/health"` never matches at root middleware level; actual path is `/api/health`. One-line fix + test update required. |
| DEPLOY-06 (integration fix) | Health check endpoint responds correctly | Affected by rate-limit skip bug — after 200 requests from same IP, `/api/health` would receive 429. Fixed by the HARD-01 path correction. |
</phase_requirements>

---

## Summary

Phase 9 is a gap-closure phase with three distinct work streams: (1) one confirmed code bug to fix and test, (2) two manual E2E verifications that cannot be automated, and (3) documentation updates to formally close three requirements that are already substantively verified.

The rate-limit bug is the only code change. Express `req.path` at root middleware level reflects the full mounted path (`/api/health`), not the sub-router suffix. The fix is a single string change in `rate-limit.ts` and a matching test update. No new packages are needed — this is purely a correctness fix within existing code.

The E2E verification work is human-only: file upload via the UI (E2E-04) and two-window WebSocket real-time observation (E2E-06) cannot be driven by Chrome DevTools MCP automation. Both require a human to operate a live browser session on the deployed stack. The verification produces evidence (screenshots or observed behavior description) that is recorded in REQUIREMENTS.md and a VERIFICATION.md report.

The doc update work is mechanical: flip three `[ ]` checkboxes to `[x]`, update two SUMMARY frontmatter blocks with `requirements-completed` fields, and create a phase 09 VERIFICATION.md. No code logic is involved.

**Primary recommendation:** One plan is sufficient. Structure it as three sequential tasks: (1) fix bug + update test + run suite green, (2) human manual E2E verifications with evidence capture, (3) doc updates and checkbox audit to bring all 28 v1.1 requirements to `[x]`.

---

## Standard Stack

No new packages are introduced in this phase. All tooling is already installed.

### Core (existing)
| Tool | Version | Purpose | Status |
|------|---------|---------|--------|
| express-rate-limit | already installed | Rate limiting middleware with skip callback | Bug fix only |
| vitest | already installed | Test runner for the rate-limit unit tests | Update existing test |
| supertest | already installed | HTTP assertions in rate-limit.test.ts | Used in updated test |

### Alternatives Considered
None — this is a bug fix, not a design choice. The correct path string is determined by Express's routing semantics, not by preference.

---

## Architecture Patterns

### Express `req.path` Behavior at Root Middleware Level

**What:** When `app.use(middleware)` is called at the root Express application (before any router is mounted), `req.path` equals the full request path as received by Express, including any router prefix.

**The specific case:**
```
app.use(createRateLimiter(...))   // line 111 — root middleware
...
app.use("/api", api)              // line 265 — router mounted later
  api.use("/health", healthRoutes)  // health mounted inside /api router
```

At line 111, `req.path` for a health check request is `/api/health` — the full path. The skip condition must match this full path.

**Contrast:** Inside the `api` sub-router, `req.path` would be `/health` (the sub-path after the mount prefix). But the rate limiter runs before the router is entered.

**Fix pattern (verified):**
```typescript
// Source: rate-limit.ts line 19 — current (BROKEN)
skip: (req) => req.path === "/health" || req.headers.upgrade === "websocket",

// Fixed
skip: (req) => req.path === "/api/health" || req.headers.upgrade === "websocket",
```

### Test Update Pattern

The existing test at `server/src/__tests__/rate-limit.test.ts` creates a test app where `/health` is mounted directly (no `/api` prefix). This means the test currently passes even though production is broken — the test does not replicate production routing.

Two valid approaches to fix the test:

**Option A — Mount health at `/api/health` in the test app (mirrors production exactly):**
```typescript
// In createTestApp:
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
// Test sends to "/api/health" and expects skip
```

**Option B — Keep `/health` in test but update skip to match test routing:**
Not valid — the bug is in production, so the test must validate the production path.

**Recommended: Option A.** The test must mirror production routing to be meaningful. Update `createTestApp` to mount health at `/api/health` and update the test assertion to hit `/api/health`. The skip string in `rate-limit.ts` changes to `/api/health` to match.

### Manual E2E Verification Pattern

Phase 7 established this pattern (07-02-SUMMARY.md):
- Use Chrome DevTools MCP for navigating, clicking, observing
- Capture screenshots as evidence
- Write results to VERIFICATION.md with status PASS/FAIL/NEEDS-MANUAL-VERIFICATION

For Phase 9:
- E2E-04 file attach: Navigate to a task, use the file attachment UI, upload any file, reload, confirm file persists
- E2E-06 WebSocket: Open the app in two browser tabs/windows, make a change in one, observe it appears in the other without refresh

### Documentation Update Pattern

Phase SUMMARYs use this frontmatter convention (established in Phase 8):
```yaml
requirements-completed: [E2E-04, E2E-05, E2E-06]
```

The Phase 7 plan 02 SUMMARY lacks this field despite having substantively verified E2E-04 and E2E-05. The update is additive — add the field to the existing frontmatter.

REQUIREMENTS.md checkbox format:
```markdown
- [ ] **E2E-04**: ... → - [x] **E2E-04**: ...
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Express path inspection | Custom URL parsing | `req.path` (already exists) | Express populates this correctly — just use the right string |
| Test HTTP assertions | Custom fetch + assertions | supertest (already used) | Consistent with existing test file |
| WebSocket real-time testing at scale | Automated WS client | Manual two-window test | Two-window human test is sufficient evidence for v1.1 milestone |

---

## Common Pitfalls

### Pitfall 1: Fixing the String But Not the Test
**What goes wrong:** Developer changes `req.path === "/health"` to `req.path === "/api/health"` in `rate-limit.ts` but leaves the test app mounting health at `/health`. Test continues to pass but still does not validate the production code path.
**Why it happens:** The test creates its own Express app with direct route mounting, so the test routing diverges from production.
**How to avoid:** Update both the middleware string AND the test route mounting. Test must use `/api/health` in `createTestApp` and hit `/api/health` in the assertion.
**Warning signs:** Test passes before and after the fix without any test modification — that means the test is not actually testing the skip condition.

### Pitfall 2: Adding `/api/health` and Breaking the WebSocket Skip
**What goes wrong:** Developer edits the skip function and accidentally removes the `req.headers.upgrade === "websocket"` clause.
**Why it happens:** Single-line edit on a compound boolean expression.
**How to avoid:** After the fix, verify the skip function still has both conditions. Run the full rate-limit test suite.

### Pitfall 3: Marking E2E-05 Without Evidence
**What goes wrong:** Marking E2E-05 as `[x]` in REQUIREMENTS.md without citing the existing screenshot evidence.
**Why it happens:** Checkbox flip feels mechanical, evidence citation gets skipped.
**How to avoid:** When updating REQUIREMENTS.md, the VERIFICATION.md for Phase 7 already has the evidence (`screenshots/10-reassigned-to-ai-agent.png`). Cross-reference it in the SUMMARY frontmatter update.

### Pitfall 4: Not Running the Full Test Suite After the Fix
**What goes wrong:** The fix passes the specific rate-limit tests but breaks something else in the suite due to an import change or a path that was relied on elsewhere.
**Why it happens:** Small surgical edits sometimes have non-obvious side effects.
**How to avoid:** After the fix, run the full server test suite (`vitest run`), not just the rate-limit test file.

### Pitfall 5: E2E-06 WebSocket Test on Wrong Environment
**What goes wrong:** Developer tests WebSocket in local dev (where WS is always same-origin) and claims E2E-06 verified, but the cross-origin WS path on the live deployment was never tested.
**Why it happens:** Local dev works differently from the Vercel + Easypanel cross-origin setup.
**How to avoid:** E2E-06 must be tested on the live deployment (Vercel frontend, Easypanel backend). Use the production URL, not localhost.

---

## Code Examples

### The Bug (Current State)
```typescript
// Source: server/src/middleware/rate-limit.ts:19
// BROKEN — req.path at root middleware level is "/api/health", not "/health"
skip: (req) => req.path === "/health" || req.headers.upgrade === "websocket",
```

### The Fix
```typescript
// Source: rate-limit.ts — corrected
skip: (req) => req.path === "/api/health" || req.headers.upgrade === "websocket",
```

### Test Update — createTestApp
```typescript
// Source: server/src/__tests__/rate-limit.test.ts — updated createTestApp
function createTestApp(redisClient?: any, limitOverride?: number) {
  const app = express();
  app.use(express.json());
  app.use(createRateLimiter(redisClient, { limit: limitOverride ?? 3 }));
  app.get("/test", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  // Mount at /api/health to mirror production routing
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  return app;
}
```

### Test Update — health skip assertion
```typescript
// Source: rate-limit.test.ts — updated test for /health skip
it("GET /api/health is not rate-limited even after exceeding limit", async () => {
  const app = createTestApp(undefined, 3);
  // Exhaust the limit on /test
  for (let i = 0; i < 4; i++) {
    await request(app).get("/test").set("X-Forwarded-For", "2.3.4.5");
  }
  // /api/health should still return 200
  const healthRes = await request(app).get("/api/health").set("X-Forwarded-For", "2.3.4.5");
  expect(healthRes.status).toBe(200);
});
```

### REQUIREMENTS.md — checkbox updates
```markdown
- [x] **E2E-04**: Invited user can change task status, attach files, create subtasks
- [x] **E2E-05**: User can reassign a task to an AI agent (bidirectional handoff works)
- [x] **E2E-06**: Real-time updates (WebSocket) work across the deployed stack
```

### Phase 7 SUMMARY frontmatter update (07-02-SUMMARY.md)
```yaml
---
phase: "07"
plan: "02"
status: complete
started: 2026-04-05
completed: 2026-04-05
requirements-completed: [E2E-04, E2E-05, E2E-06]
---
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Skip health by sub-path `/health` | Skip by full mounted path `/api/health` | Phase 9 (this fix) | Health endpoint no longer rate-limited under heavy load |
| E2E-04/05/06 checkboxes unchecked | All 28 v1.1 requirements `[x]` | Phase 9 (this phase) | v1.1 milestone formally closed |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (already configured) |
| Config file | `server/vitest.config.ts` |
| Quick run command | `cd server && npx vitest run src/__tests__/rate-limit.test.ts` |
| Full suite command | `cd server && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HARD-01 (fix) | `/api/health` skip condition corrected | unit | `cd server && npx vitest run src/__tests__/rate-limit.test.ts` | Yes — update existing |
| DEPLOY-06 (fix) | Health endpoint not rate-limited | unit | Same as above | Yes — update existing |
| E2E-04 | File attach persists after reload | manual-only | N/A — requires browser UI | N/A |
| E2E-05 | AI agent reassignment works | doc-only | N/A — screenshot evidence exists | N/A |
| E2E-06 | WS real-time across two windows | manual-only | N/A — requires live two-window test | N/A |

**Manual-only justification (E2E-04):** File upload requires a browser UI interaction with a file picker. Chrome DevTools MCP cannot interact with native OS file dialogs.

**Manual-only justification (E2E-06):** Two-window WebSocket real-time test requires observing cross-origin WebSocket on live deployment. Cannot be simulated in unit tests or driven reliably by automation without a dedicated E2E framework (Playwright/Cypress) that is out of scope for this phase.

### Sampling Rate
- **Per task commit:** `cd server && npx vitest run src/__tests__/rate-limit.test.ts`
- **Per wave merge:** `cd server && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all automated requirements. `rate-limit.test.ts` exists and runs. Manual verifications do not require test infrastructure.

---

## Open Questions

1. **E2E-06 environment access**
   - What we know: Live Vercel frontend + Easypanel backend are deployed; WebSocket wiring is correct in code
   - What's unclear: Whether the human running Phase 9 has access to the live deployment for two-window manual testing
   - Recommendation: Plan should note that if live deployment is inaccessible, the requirement can be verified on localhost with `VITE_API_URL` pointing to local backend — but this is weaker evidence; prefer live deployment

2. **E2E-04 file storage backend**
   - What we know: File attach is implemented; the VERIFICATION.md says it needs manual test; local file storage is in use (PROD-02 S3/R2 is v1.2 scope)
   - What's unclear: Whether file storage works on Easypanel (local filesystem volume mount?) or if files are stored in the database
   - Recommendation: Manual test should verify the file appears in the UI after a page reload; if files are lost on container restart (ephemeral FS), note this as a known limitation for v1.2

---

## Sources

### Primary (HIGH confidence)
- Direct code read: `server/src/middleware/rate-limit.ts` — confirmed bug on line 19
- Direct code read: `server/src/app.ts` lines 110-111, 170-171, 265 — confirmed root middleware placement and `/api` router mount
- Direct code read: `server/src/__tests__/rate-limit.test.ts` — confirmed test uses `/health` (not `/api/health`), validating the test gap
- `.planning/v1.1-MILESTONE-AUDIT.md` — authoritative gap list, all three requirement gaps and integration bug documented

### Secondary (MEDIUM confidence)
- `.planning/phases/07-end-to-end-verification/07-VERIFICATION.md` — E2E status per requirement, screenshot evidence catalogue
- `.planning/phases/08-api-hardening-redis/08-02-SUMMARY.md` — confirms rate-limiter implementation decisions and test decisions

### Tertiary (LOW confidence)
None — all findings are based on direct code and doc inspection.

---

## Metadata

**Confidence breakdown:**
- Bug identification and fix: HIGH — confirmed by direct code read of rate-limit.ts:19 and app.ts mount order
- Test update pattern: HIGH — confirmed by direct read of rate-limit.test.ts
- E2E manual verification scope: HIGH — directly documented in Phase 7 VERIFICATION.md and Milestone Audit
- Doc update targets: HIGH — REQUIREMENTS.md and SUMMARY files read directly

**Research date:** 2026-04-05
**Valid until:** Stable (this phase has no external dependencies — all findings are internal to the codebase)
