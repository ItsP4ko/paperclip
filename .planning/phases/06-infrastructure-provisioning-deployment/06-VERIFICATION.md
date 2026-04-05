---
phase: 06-infrastructure-provisioning-deployment
verified: 2026-04-04T00:00:00Z
status: gaps_found
score: 2/4 must-haves verified
gaps:
  - truth: "Railway container is running with SERVE_UI=false; GET /health returns 200 and Railway health checks pass"
    status: failed
    reason: "The actual deployment uses Easypanel (not Railway). The deploy_easypanel_state.md memory file documents the backend at easypanel.host. The SUMMARY claims Railway but this contradicts the live deployment state. The plan's own requirement (DEPLOY-05) maps to Railway specifically."
    artifacts:
      - path: ".planning/phases/06-infrastructure-provisioning-deployment/06-03-SUMMARY.md"
        issue: "Claims Railway deployment but memory file shows Easypanel backend at paperclip-paperclip-api.qiwa34.easypanel.host"
    missing:
      - "Clarify and confirm which platform is the authoritative backend host (Railway vs Easypanel)"
      - "If Easypanel: update DEPLOY-05 acceptance criteria or replace Railway references in docs; if Railway: deploy to Railway and verify health"

  - truth: "A user can sign up and log in from the Vercel frontend to the Railway/backend — session cookie is set and persists across page refreshes"
    status: failed
    reason: "The deploy_easypanel_state.md memory file (written after the SUMMARY commit) records bootstrapStatus=bootstrap_pending, a [object Object] UI rendering bug, and lists 'Verify auth flow' as step 3 in remaining work — directly contradicting the SUMMARY's claim that auth was verified. The SUMMARY was written before auth verification was complete."
    artifacts:
      - path: ".claude/memory (global): deploy_easypanel_state.md"
        issue: "bootstrapStatus=bootstrap_pending means no admin user exists; sign-up flow cannot be verified without first completing bootstrap. [object Object] rendering bug was open at time of SUMMARY commit."
    missing:
      - "Fix [object Object] error in UI (error not being stringified; health.ts fix was committed but App.tsx may still have the issue)"
      - "Complete bootstrap flow: create first admin user via bootstrap invite or direct sign-up"
      - "Verify sign-up POST /api/auth/sign-up/email returns 200 from Vercel URL"
      - "Verify sign-in POST /api/auth/sign-in/email sets a BetterAuth session cookie with SameSite=None; Secure"
      - "Verify GET /api/auth/get-session returns 200 with valid session after page refresh"
human_verification:
  - test: "Verify backend health endpoint"
    expected: "GET https://[backend-url]/api/health returns HTTP 200 with {status: 'ok', bootstrapStatus: 'ready' or 'bootstrap_pending'}"
    why_human: "Requires live deployed backend; cannot curl from local codebase verification"
  - test: "Sign up a new user from the Vercel frontend"
    expected: "POST /api/auth/sign-up/email returns 200; no CORS errors in browser console; user sees dashboard or bootstrap page"
    why_human: "End-to-end browser flow requiring live Vercel + backend deployment"
  - test: "Sign in and verify session persistence across refresh"
    expected: "Session cookie set with SameSite=None; Secure; GET /api/auth/get-session returns 200 with session data after F5"
    why_human: "Requires live browser session and cookie inspection in DevTools"
  - test: "Verify [object Object] bug is resolved"
    expected: "Vercel frontend loads without showing '[object Object]' or raw error objects in the UI"
    why_human: "UI rendering bug; requires browser observation of the live Vercel deployment"
---

# Phase 6: Infrastructure Provisioning & Deployment Verification Report

**Phase Goal:** Supabase, Railway, and Vercel are all live with correct env vars wired between them, and the backend responds to authenticated API requests from the Vercel frontend
**Verified:** 2026-04-04
**Status:** GAPS FOUND
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Supabase PostgreSQL is provisioned and the full schema is migrated — backend boots against Supabase without schema errors | ? UNCERTAIN | SUMMARY (06-02) claims 66 tables and 49 migrations applied; human-confirmed. Cannot verify against live Supabase from codebase. Code prerequisite (`max: 10` pool cap) is verified. |
| 2 | Railway container is running with SERVE_UI=false; GET /health returns 200 and Railway health checks pass | FAILED | Memory file (deploy_easypanel_state.md) records the backend is at `paperclip-paperclip-api.qiwa34.easypanel.host` (Easypanel), not Railway. Health responds 200 at the Easypanel URL, but the plan/requirement specifically names Railway. |
| 3 | Vercel deployment completes with VITE_API_URL pointing to Railway; direct-navigation to any route returns the app (not a 404) | PARTIAL | Vercel is deployed at `paperclip-beige-five.vercel.app` per memory file. `VITE_API_URL` is baked in pointing to the Easypanel backend. `vercel.json` SPA rewrite exists in both `ui/vercel.json` and root `vercel.json` (added by commit `b2c7167a` after the plan). The URL targets Easypanel, not Railway. |
| 4 | A user can sign up and log in from the Vercel frontend to the Railway backend — session cookie is set and persists across page refreshes | FAILED | Memory file (written after the SUMMARY) shows `bootstrapStatus: bootstrap_pending`, a `[object Object]` UI rendering bug outstanding, and lists "Verify auth flow" as step 3 in remaining work. SUMMARY claim of "auth works" is contradicted by this evidence. |

**Score:** 0/4 truths fully verified (1 uncertain/partial, 2 failed, 1 partial)

---

## Required Artifacts

### Plan 01 (DEPLOY-10): Connection Pool Cap

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/client.ts` | `postgres(url, { max: 10 })` in `createDb()` | VERIFIED | Line 49: `const sql = postgres(url, { max: 10 });` — confirmed in codebase |
| `packages/db/src/client.ts` | `createUtilitySql` keeps `{ max: 1 }` | VERIFIED | Line 14: `return postgres(url, { max: 1, onnotice: () => {} })` — unchanged |

Commit `f6a7f125` verified in git log. This is the only code-level artifact for the phase; all other artifacts are infrastructure (external services).

### Plan 02 (DEPLOY-09, DEPLOY-11): Supabase Provisioning

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/migrations/*.sql` | 49 migration files (0000–0048) | VERIFIED | 49 `.sql` files confirmed via file listing |
| Supabase live database | 66 public tables, 49 journal entries | UNCERTAIN | Human-confirmed in SUMMARY; no programmatic verification possible from codebase |

### Plan 03 (DEPLOY-05, DEPLOY-07, AUTH-05): Railway + Vercel Deployment

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| Backend deployment | Railway with `SERVE_UI=false`, `/api/health` returns 200 | FAILED | Actual deployment is on Easypanel, not Railway. Health returning 200 at Easypanel URL per memory file, but bootstrap_pending state means no complete auth possible. |
| `vercel.json` (root) | SPA rewrites present | VERIFIED | Root `vercel.json` added by commit `b2c7167a` with `rewrites: [{"source": "/(.*)", "destination": "/index.html"}]` |
| `ui/vercel.json` | SPA rewrites present | VERIFIED | Contains same rewrite rule |
| `ui/src/lib/api-base.ts` | `VITE_API_URL` drives `API_BASE` | VERIFIED | Line 6/9: `const API_ORIGIN = import.meta.env.VITE_API_URL || ""; export const API_BASE = API_ORIGIN ? ...` |
| `ui/src/api/health.ts` | Uses `API_BASE` not hardcoded `/api/health` | VERIFIED | Fixed by commit `37e23e99`; line 33: `fetch(\`${API_BASE}/health\`, ...)` |
| Cross-origin auth flow | Sign-up, sign-in, session persistence verified | FAILED | Memory file shows bootstrap_pending + [object Object] bug outstanding; auth not yet verified |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/db/src/client.ts` `createDb()` | `postgres()` constructor | `{ max: 10 }` option object | WIRED | Pattern `postgres(url, { max: 10 })` confirmed at line 49 |
| Vercel SPA | Backend | `VITE_API_URL` build-time env var | PARTIAL | `api-base.ts` correctly reads `VITE_API_URL`; Vercel has it set per memory file; but target is Easypanel, not Railway as planned |
| BetterAuth on backend | Vercel frontend origin | `PAPERCLIP_ALLOWED_HOSTNAMES` includes Vercel domain | PARTIAL | Memory shows `PAPERCLIP_ALLOWED_HOSTNAMES=paperclip-paperclip-api.qiwa34.easypanel.host,paperclip-beige-five.vercel.app` — Vercel domain included, but CORS works to Easypanel backend, not Railway |
| BetterAuth instance | Trusted origins | `deriveAuthTrustedOrigins()` includes Vercel hostname | VERIFIED (code) | `better-auth.ts` line 57: iterates `config.allowedHostnames` to build `trustedOrigins`; code is correct |
| BetterAuth cookies | Cross-origin browser | `SameSite=None; Secure` attributes | VERIFIED (code) | `better-auth.ts` lines 103–107: `defaultCookieAttributes: { sameSite: "none", secure: true }` when not HTTP-only |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DEPLOY-05 | 06-03-PLAN | Backend deployed to Railway using Dockerfile with `SERVE_UI=false` | FAILED | Backend is on Easypanel, not Railway. REQUIREMENTS.md still shows `[ ]` (not checked off). |
| DEPLOY-07 | 06-03-PLAN | All required env vars configured in Railway | FAILED | Vars are on Easypanel backend, not Railway. REQUIREMENTS.md still shows `[ ]`. |
| DEPLOY-09 | 06-02-PLAN | Supabase PostgreSQL provisioned and schema migrated | UNCERTAIN | SUMMARY claims 66 tables/49 migrations; human-confirmed only; REQUIREMENTS.md still shows `[ ]`. |
| DEPLOY-10 | 06-01-PLAN | Backend connects via session-mode pooler (port 5432) with pool size cap | VERIFIED (code) | `createDb()` has `{ max: 10 }`. Session-mode pooler is documented in SUMMARY. REQUIREMENTS.md still shows `[ ]`. |
| DEPLOY-11 | 06-02-PLAN | Existing data model works on Supabase without schema changes | UNCERTAIN | SUMMARY claims 66 tables via standard Drizzle DDL; no code changes needed; REQUIREMENTS.md still shows `[ ]`. |
| AUTH-05 | 06-03-PLAN | User can sign up and log in from Vercel frontend to Railway backend | FAILED | Memory file shows bootstrap_pending, [object Object] bug, auth verification listed as remaining step. REQUIREMENTS.md still shows `[ ]`. |

**Note:** All six Phase 6 requirements remain unchecked in REQUIREMENTS.md. The requirements file was not updated after the SUMMARY commits.

---

## Anti-Patterns Found

| File | Finding | Severity | Impact |
|------|---------|----------|--------|
| `06-03-SUMMARY.md` | Claims "None" issues encountered and "auth works" but memory file contradicts this — bootstrap_pending, `[object Object]` bug, auth verification still pending when memory was written | BLOCKER | Summary is inaccurate; creates false confidence that AUTH-05 is satisfied |
| `06-03-SUMMARY.md` | Claims Railway deployment but actual backend is on Easypanel | BLOCKER | DEPLOY-05 and DEPLOY-07 are mapped to Railway specifically; Easypanel deployment does not satisfy these requirements unless re-scoped |
| `REQUIREMENTS.md` | All Phase 6 requirements still show `[ ]` (pending) despite SUMMARY claims of completion | WARNING | Traceability table out of sync with claimed state |

---

## Human Verification Required

### 1. Confirm Live Backend Platform

**Test:** Identify the authoritative backend host — Railway or Easypanel
**Expected:** One confirmed URL (e.g., `https://xxx.up.railway.app` or `https://paperclip-paperclip-api.qiwa34.easypanel.host`) responds to `GET /api/health` with HTTP 200
**Why human:** Cannot query live infrastructure from codebase

### 2. Verify [object Object] Bug Resolution

**Test:** Open `https://paperclip-beige-five.vercel.app` in a browser; check for `[object Object]` text appearing in red anywhere
**Expected:** No raw error object rendered as string; app shows either BootstrapPendingPage or a functional UI
**Why human:** UI rendering bug requires visual browser inspection

### 3. Complete Bootstrap and Verify Sign-Up

**Test:** If backend shows `bootstrapStatus: "bootstrap_pending"`: run bootstrap invite command via CLI (`relaycontrol auth-bootstrap-ceo ...`) to create first admin. Then attempt sign-up from the Vercel URL.
**Expected:** POST to `/api/auth/sign-up/email` returns 200; user redirected to dashboard; no CORS errors in browser console
**Why human:** Auth flow requires browser and live deployed services

### 4. Session Persistence After Refresh

**Test:** After sign-in on Vercel, press F5; check DevTools > Application > Cookies for BetterAuth session cookie; check Network tab for `/api/auth/get-session` returning 200 with session data
**Expected:** Session cookie has `SameSite=None; Secure`; GET `/api/auth/get-session` returns valid session JSON after refresh
**Why human:** Session cookie behavior requires real browser execution

---

## Gaps Summary

Phase 6 has two distinct gap categories:

**Gap 1 — Platform mismatch (DEPLOY-05, DEPLOY-07):** The plans specify Railway as the backend host. The actual deployment is on Easypanel. The 06-03-SUMMARY presents this as a seamless Railway deployment, which is inaccurate. Either the deployment must be migrated to Railway (satisfying the requirements as written), or the requirements and plans must be updated to reflect Easypanel as the accepted platform.

**Gap 2 — Auth not verified (AUTH-05):** The 06-03-SUMMARY claims sign-up, sign-in, and session persistence were verified, but the `deploy_easypanel_state.md` memory file (written on the same day, after the SUMMARY commit) records `bootstrapStatus: bootstrap_pending`, an active `[object Object]` rendering bug, and lists "Verify auth flow" as item 3 in remaining work. The SUMMARY was written before auth verification was actually completed. Several post-plan bug-fix commits (`37e23e99`, `b2c7167a`) confirm real issues were encountered and fixed after the SUMMARY was written.

**Gap 3 — REQUIREMENTS.md not updated:** All six Phase 6 requirements remain `[ ]` in REQUIREMENTS.md. This is a documentation gap, not a functional one, but it means the traceability record is inconsistent with the SUMMARY claims.

The one code artifact in this phase — the postgres.js pool size cap (`max: 10` in `createDb()`) — is fully verified in the codebase and satisfies the DEPLOY-10 code prerequisite.

---

_Verified: 2026-04-04_
_Verifier: Claude (gsd-verifier)_
