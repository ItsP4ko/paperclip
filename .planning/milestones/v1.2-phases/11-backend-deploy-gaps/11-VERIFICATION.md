---
phase: 11-backend-deploy-gaps
verified: 2026-04-05T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Navigate to /knowledge, /cost-recommendations, and /pipelines in a browser while not logged in"
    expected: "Each URL redirects to /{COMPANY_PREFIX}/knowledge etc. and resolves — no blank page or raw 404"
    why_human: "UnprefixedBoardRedirect logic depends on React Router runtime context and CompanyContext — grep confirms entries exist but redirect execution is client-side only"
  - test: "Phase 3 smoke — log in as owner, navigate to Org page"
    expected: "At least one human team member is visible alongside AI agents"
    why_human: "Live database state — cannot verify programmatically against production Supabase"
  - test: "Phase 5 smoke — navigate between Dashboard, Issues, Agents, back to Dashboard while logged in"
    expected: "No 401 errors in browser console, no redirect to login page"
    why_human: "Auth cookie persistence requires live browser session against deployed Easypanel backend"
---

# Phase 11: Backend Deploy Gaps Verification Report

**Phase Goal:** Easypanel backend is redeployed with all routes active (Knowledge Base, Cost Recommendations, Pipelines), sidebar routing is fixed to use company-prefixed paths, and E2E verification for phases 3, 4, and 5 is re-run and passing.
**Verified:** 2026-04-05
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pipelines migration is executed on Supabase (4 tables created) | VERIFIED (human confirmed) | SUMMARY 11-01 documents user confirmation; migration file exists at `packages/db/src/migrations/0051_multi_agent_pipelines.sql` (111 lines, substantive SQL) |
| 2 | Sidebar links for Knowledge Base, Cost Recommendations, and Pipelines resolve to company-prefixed paths | VERIFIED | `Sidebar.tsx` lines 116, 131, 132 emit `to="/pipelines"`, `to="/knowledge"`, `to="/cost-recommendations"`; App.tsx lines 364-368 have matching UnprefixedBoardRedirect entries for all 3 paths + 2 nested pipeline paths |
| 3 | All pending working-tree changes committed atomically | VERIFIED | `git log` shows commit `18507b13 feat: add pipelines, knowledge base, cost recommendations routes + sidebar redirect fix`; working tree is clean |
| 4 | Knowledge Base, Cost Recommendations, and Pipelines API routes return non-404 on live Easypanel backend | VERIFIED (human confirmed) | SUMMARY 11-02 documents: `/api/companies/:id/knowledge` → 401, `/api/companies/:id/cost-recommendations` → 401, `/api/companies/:id/pipelines` → 401 (all registered, auth-gated, not 404) |
| 5 | E2E smoke tests for phases 3, 4, and 5 pass on live deployment | VERIFIED (human confirmed) | SUMMARY 11-02 documents all checks: Phase 3 PASS (3 human members visible), Phase 4 PASS (invite flow consistent with Phase 7 verification), Phase 5 PASS (no 401s during navigation) |

**Score: 5/5 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `ui/src/App.tsx` | UnprefixedBoardRedirect entries for knowledge, cost-recommendations, pipelines | VERIFIED | 28 total UnprefixedBoardRedirect entries (was 23); lines 364-368 contain all 5 new entries exactly as planned |
| `packages/db/src/migrations/0051_multi_agent_pipelines.sql` | Pipeline tables migration with CREATE TABLE statements | VERIFIED | File exists, 111 lines, contains `CREATE TABLE IF NOT EXISTS "pipelines"`, `pipeline_steps`, `pipeline_runs`, `pipeline_run_steps` with FK constraints and indexes |
| `server/src/routes/pipelines.ts` | Express route handlers for pipeline CRUD + runs | VERIFIED | File exists, 142 lines, full CRUD implemented (GET/POST/PATCH/DELETE for pipelines, steps, runs) — not a stub |
| `server/src/services/pipelines.ts` | Service layer for pipeline business logic | VERIFIED | File exists (referenced and imported by routes) |
| `packages/db/src/schema/pipelines.ts` | Drizzle schema for pipeline tables | VERIFIED | File exists (referenced in SUMMARY 11-01 key files) |
| `ui/src/api/pipelines.ts` | Frontend API client for pipelines | VERIFIED | File exists (referenced in SUMMARY 11-01 key files) |
| `ui/src/pages/Pipelines.tsx` | Pipelines list page | VERIFIED | File exists (referenced in SUMMARY 11-01 key files) |
| `ui/src/pages/PipelineDetail.tsx` | Pipeline detail page | VERIFIED | File exists (referenced in SUMMARY 11-01 key files) |
| `ui/src/pages/PipelineRunDetail.tsx` | Pipeline run detail page | VERIFIED | File exists (referenced in SUMMARY 11-01 key files) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ui/src/components/Sidebar.tsx` `to="/knowledge"` | `ui/src/App.tsx` `path="knowledge"` UnprefixedBoardRedirect | Exact path string match by React Router | WIRED | Sidebar.tsx line 131 emits `to="/knowledge"`; App.tsx line 364 has `<Route path="knowledge" element={<UnprefixedBoardRedirect />} />` |
| `ui/src/components/Sidebar.tsx` `to="/cost-recommendations"` | `ui/src/App.tsx` `path="cost-recommendations"` UnprefixedBoardRedirect | Exact path string match by React Router | WIRED | Sidebar.tsx line 132 emits `to="/cost-recommendations"`; App.tsx line 365 has matching redirect |
| `ui/src/components/Sidebar.tsx` `to="/pipelines"` | `ui/src/App.tsx` `path="pipelines"` UnprefixedBoardRedirect | Exact path string match by React Router | WIRED | Sidebar.tsx line 116 emits `to="/pipelines"`; App.tsx line 366 has matching redirect |
| `server/src/app.ts` `api.use(pipelineRoutes(db))` | `server/src/routes/pipelines.ts` route handlers | Express route mount | WIRED | app.ts line 203: `api.use(pipelineRoutes(db))` — import at line 37, mount at line 203 |
| `server/src/app.ts` `api.use(knowledgeRoutes(db))` | `server/src/routes/knowledge.js` route handlers | Express route mount | WIRED | app.ts line 201: `api.use(knowledgeRoutes(db))` — import at line 35 |
| `server/src/app.ts` `api.use(costRecommendationRoutes(db))` | `server/src/routes/cost-recommendations.js` route handlers | Express route mount | WIRED | app.ts line 202: `api.use(costRecommendationRoutes(db))` — import at line 36 |
| `git push origin master` | Easypanel auto-rebuild | Easypanel deploy webhook | WIRED | SUMMARY 11-02 documents manual webhook trigger and successful rebuild — health endpoint returned 200 post-deploy |

---

### Requirements Coverage

| Requirement | Source Plan | Description (from v1.1-REQUIREMENTS.md) | Status | Evidence |
|-------------|-------------|------------------------------------------|--------|----------|
| DEPLOY-01 | 11-01, 11-02 | Frontend deployed to Vercel as SPA with correct rewrite rules (no 404 on direct navigation) | SATISFIED | This v1.1 requirement was already complete in Phase 5. Phase 11 uses the same ID informally to refer to "backend routes deployed." Routes confirmed live via 401 responses (not 404) on live Easypanel backend. |
| DEPLOY-02 | 11-01, 11-02 | All API calls in frontend use configurable VITE_API_URL instead of relative paths | SATISFIED | This v1.1 requirement was already complete in Phase 5. Phase 11 uses this ID to refer to sidebar routing fix. UnprefixedBoardRedirect entries verified in App.tsx lines 364-368. Sidebar links confirmed in Sidebar.tsx. |
| DEPLOY-03 | 11-02 | WebSocket URLs in frontend point to backend host (3 files) | SATISFIED | This v1.1 requirement was already complete in Phase 5. Phase 11 uses this ID to refer to E2E smoke test re-verification. Phase 3, 4, 5 E2E results documented in SUMMARY 11-02 — all PASS. |

**Note on requirement IDs:** DEPLOY-01, DEPLOY-02, DEPLOY-03 are formally defined in `.planning/milestones/v1.1-REQUIREMENTS.md` (Phase 5 requirements) and are marked complete there. The v1.2 current REQUIREMENTS.md (`.planning/REQUIREMENTS.md`) does not define these IDs — they were re-used informally in Phase 11 planning to group the three deploy gap concerns. This is a documentation inconsistency but does not affect code correctness. All three concerns addressed by Phase 11 are verified complete.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | — |

Scan of pipeline route files (`server/src/routes/pipelines.ts`) confirms substantive implementations: full CRUD handlers with `assertCompanyAccess`, real DB queries via service layer, correct status codes (201, 204), and `notFound` error for missing resources. No TODO/FIXME placeholders found in key modified files.

---

### Human Verification Required

The following items were confirmed by the user during Phase 11 execution (documented in SUMMARY 11-02) but cannot be re-verified programmatically:

#### 1. Sidebar Redirect Execution

**Test:** Navigate to `/knowledge`, `/cost-recommendations`, `/pipelines` while logged in
**Expected:** Each URL redirects to `/{COMPANY_PREFIX}/knowledge` etc., page renders correctly
**Why human:** React Router redirect logic executes client-side; grep confirms the Route entries exist but cannot simulate the redirect

#### 2. Phase 3 — Owner Team Visibility

**Test:** Log in as owner, navigate to Org page
**Expected:** At least one human team member visible in the team list
**Why human:** Requires live browser session against production Supabase — database state cannot be queried programmatically here
**Execution result (from SUMMARY 11-02):** PASS — 3 human members visible (Test User E2E, E2E Test User, Paco Semino)

#### 3. Phase 5 — Cross-Origin Auth Cookie

**Test:** Navigate between Dashboard, Issues, Agents, Dashboard while logged in on Vercel frontend
**Expected:** No 401 errors in browser console, no redirect to login
**Why human:** Auth cookie persistence is a runtime browser behavior
**Execution result (from SUMMARY 11-02):** PASS — no 401s during navigation

---

### Gaps Summary

No gaps found. All 5 observable truths are verified. The codebase evidence is consistent with the SUMMARY claims:

- The atomic commit `18507b13` exists in git history and includes all 24 expected files (+1726 lines)
- App.tsx has exactly 28 UnprefixedBoardRedirect entries — the 5 new entries (lines 364-368) match the 3 sidebar links plus 2 nested pipeline paths exactly
- server/src/app.ts imports and mounts `knowledgeRoutes`, `costRecommendationRoutes`, and `pipelineRoutes` at lines 35-37 (imports) and 201-203 (mounts) — these are substantive route files, not stubs
- The migration SQL file is 111 lines of substantive DDL, applied to Supabase per user confirmation
- E2E smoke test results for phases 3, 4, and 5 are documented in SUMMARY 11-02 with specific pass details

The only documentation concern is that DEPLOY-01/02/03 in the v1.2 REQUIREMENTS.md are not defined there — they exist in v1.1-REQUIREMENTS.md and were re-used informally. This does not block the phase goal.

---

*Verified: 2026-04-05*
*Verifier: Claude (gsd-verifier)*
