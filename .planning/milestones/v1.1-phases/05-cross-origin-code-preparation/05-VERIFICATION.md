---
phase: 05-cross-origin-code-preparation
verified: 2026-04-04T14:30:30Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 05: Cross-Origin Code Preparation Verification Report

**Phase Goal:** Prepare the codebase for cross-origin deployment (Vercel frontend to Railway backend) by adding CORS middleware, fixing auth cookie config, centralizing API base URLs, and adding Vercel SPA rewrite config.
**Verified:** 2026-04-04T14:30:30Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from Plan must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CORS preflight from allowed Vercel origin returns Access-Control-Allow-Origin and Access-Control-Allow-Credentials headers | VERIFIED | `cors-middleware.test.ts` 4 tests pass; `app.ts` lines 95–106 confirm first-middleware position |
| 2 | CORS request from unlisted origin is rejected | VERIFIED | Test "does NOT set Access-Control-Allow-Origin for unlisted origin" passes |
| 3 | BetterAuth cookies use SameSite=None and Secure=true for HTTPS deployments | VERIFIED | `better-auth.ts` lines 100–108 confirm `defaultCookieAttributes`; `better-auth-cookies.test.ts` 3 tests pass |
| 4 | Server throws on startup if BETTER_AUTH_SECRET is unset (no silent fallback) | VERIFIED | `better-auth.ts` lines 70–75: `throw new Error("...BETTER_AUTH_SECRET must be set...")`. No `"paperclip-dev-secret"` string found in file |
| 5 | boardMutationGuard accepts POST from an external origin listed in allowedOrigins parameter | VERIFIED | `board-mutation-guard.ts` signature is `boardMutationGuard(opts: { allowedOrigins?: string[] } = {})`; `board-mutation-guard.test.ts` 11 tests pass including 2 new allowedOrigins tests |
| 6 | All REST API calls use VITE_API_URL as base when set, fall back to /api when unset | VERIFIED | `api-base.ts` exports `API_BASE`; `client.ts` line 1 imports it; `auth.ts` uses `${API_BASE}/auth...` throughout |
| 7 | All three WebSocket URL constructions derive host from VITE_API_URL when set | VERIFIED | `LiveUpdatesProvider.tsx`, `useLiveRunTranscripts.ts`, `AgentDetail.tsx` all import and call `getWsHost()` — no `window.location.host` in WebSocket URL lines |
| 8 | Vercel SPA rewrite rule exists so direct navigation to any route returns index.html | VERIFIED | `ui/vercel.json` contains `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}` |
| 9 | Health endpoint and PORT env var tests continue to pass | VERIFIED | `health.test.ts` and `paperclip-env.test.ts` both exist on disk; full test run reported 601 tests pass |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/app.ts` | CORS middleware insertion before express.json() | VERIFIED | `import cors from "cors"` line 2; `app.use(cors({...}))` at lines 95–106, before `app.use(express.json(...))` at line 108 |
| `server/src/auth/better-auth.ts` | Cross-origin cookie config and secret validation | VERIFIED | `defaultCookieAttributes` at lines 102–107; `throw new Error` at line 72–74; no hardcoded fallback |
| `server/src/middleware/board-mutation-guard.ts` | External origin acceptance via allowedOrigins parameter | VERIFIED | Signature `boardMutationGuard(opts: { allowedOrigins?: string[] } = {})` at line 44; `extraOrigins` parameter threaded through all internal functions |
| `server/src/__tests__/cors-middleware.test.ts` | CORS middleware unit tests | VERIFIED | 4 tests: allowed origin, preflight, rejected origin, no-origin; all pass |
| `server/src/__tests__/better-auth-cookies.test.ts` | Cookie config and secret validation tests | VERIFIED | 3 tests: HTTPS defaultCookieAttributes, HTTP useSecureCookies, secret throw; all pass |
| `server/src/__tests__/board-mutation-guard.test.ts` | boardMutationGuard with allowedOrigins tests | VERIFIED | 11 tests pass (9 existing + 2 new allowedOrigins tests) |
| `ui/src/lib/api-base.ts` | Centralized API_BASE constant and getWsHost() helper | VERIFIED | Exports `API_BASE` and `getWsHost()`; uses `import.meta.env.VITE_API_URL`, `new URL(apiUrl).host`, and `window.location.host` fallback |
| `ui/src/lib/api-base.test.ts` | Unit tests for API_BASE and getWsHost | VERIFIED | 6 tests: 3 for API_BASE, 3 for getWsHost(); all pass |
| `ui/src/api/client.ts` | REST API calls using API_BASE | VERIFIED | Line 1: `import { API_BASE } from "@/lib/api-base"`; `const BASE = API_BASE` |
| `ui/src/api/auth.ts` | Auth API calls using API_BASE | VERIFIED | Line 1: `import { API_BASE } from "@/lib/api-base"`; both fetch calls use `${API_BASE}/auth...` |
| `ui/vercel.json` | SPA rewrite rule for Vercel deployment | VERIFIED | `{"rewrites":[{"source":"/(.*)", "destination":"/index.html"}]}` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/src/app.ts` | cors middleware | `app.use(cors({...}))` as first middleware | WIRED | Lines 95–106, before `express.json()` at line 108 |
| `server/src/app.ts` | `board-mutation-guard.ts` | `boardMutationGuard({ allowedOrigins: guardAllowedOrigins })` | WIRED | Line 163: `api.use(boardMutationGuard({ allowedOrigins: guardAllowedOrigins }))` |
| `server/src/auth/better-auth.ts` | BetterAuth config | `advanced.defaultCookieAttributes` with `sameSite: "none"` | WIRED | Lines 100–108: HTTPS branch sets `defaultCookieAttributes: { sameSite: "none", secure: true }` |
| `ui/src/api/client.ts` | `ui/src/lib/api-base.ts` | `import { API_BASE } from "@/lib/api-base"` | WIRED | Line 1 import; `const BASE = API_BASE` immediately used in fetch |
| `ui/src/api/auth.ts` | `ui/src/lib/api-base.ts` | `import { API_BASE } from "@/lib/api-base"` | WIRED | Line 1 import; used in both `authPost` and `getSession` fetch calls |
| `ui/src/context/LiveUpdatesProvider.tsx` | `ui/src/lib/api-base.ts` | `import { getWsHost } from "@/lib/api-base"` | WIRED | Line 2 import; `getWsHost()` called at line 777 in WebSocket URL construction |
| `ui/src/components/transcript/useLiveRunTranscripts.ts` | `ui/src/lib/api-base.ts` | `import { getWsHost } from "@/lib/api-base"` | WIRED | Line 2 import; `getWsHost()` called at line 190 in WebSocket URL construction |
| `ui/src/pages/AgentDetail.tsx` | `ui/src/lib/api-base.ts` | `import { getWsHost } from "@/lib/api-base"` | WIRED | Line 3 import; `getWsHost()` called at line 3568 in WebSocket URL construction |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| AUTH-01 | Plan 01 | CORS middleware allows credentialed requests from PAPERCLIP_ALLOWED_HOSTNAMES origins | SATISFIED | `cors-middleware.test.ts` 4 tests pass; CORS is first middleware in `app.ts` |
| AUTH-02 | Plan 01 | BetterAuth cookies set to SameSite=None; Secure for cross-origin auth | SATISFIED | `better-auth.ts` defaultCookieAttributes; `better-auth-cookies.test.ts` confirms |
| AUTH-03 | Plan 01 | boardMutationGuard accepts mutations from allowedOrigins (Vercel domain) | SATISFIED | `board-mutation-guard.ts` opts.allowedOrigins; `app.ts` passes guardAllowedOrigins; tests confirm |
| AUTH-04 | Plan 01 | No hardcoded secret fallback; throws when BETTER_AUTH_SECRET missing | SATISFIED | No `"paperclip-dev-secret"` in better-auth.ts; throw confirmed in code and tests |
| DEPLOY-01 | Plan 02 | Frontend SPA with correct rewrite rules on Vercel | SATISFIED | `ui/vercel.json` with catch-all rewrite to index.html |
| DEPLOY-02 | Plan 02 | All API calls use configurable VITE_API_URL instead of relative paths | SATISFIED | `client.ts` and `auth.ts` use API_BASE; no hardcoded `/api` relative fetch paths |
| DEPLOY-03 | Plan 02 | WebSocket URLs point to backend host, not CDN host (3 files) | SATISFIED | All 3 WS files import and use `getWsHost()`; no `window.location.host` in WS URL lines |
| DEPLOY-04 | Plan 02 | Frontend build succeeds with VITE_API_URL set | SATISFIED | SUMMARY confirms vite build passes with VITE_API_URL=https://test.railway.app (pre-existing tsc error unrelated to this phase) |
| DEPLOY-06 | Plan 01 | Health check endpoint responds correctly | SATISFIED | `health.test.ts` exists and confirmed passing in SUMMARY (601 tests, 0 failures) |
| DEPLOY-08 | Plan 01 | Backend reads PORT from environment | SATISFIED | `paperclip-env.test.ts` exists and confirmed passing in SUMMARY |

**Orphaned requirements:** None. All 10 Phase 5 requirements from REQUIREMENTS.md are accounted for across the two plans.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| — | None found | — | — |

No TODOs, FIXMEs, placeholder returns, stub handlers, or hardcoded dev secrets found in any phase 05 modified files.

---

### Human Verification Required

#### 1. Live CORS preflight behavior in production topology

**Test:** Deploy backend to Railway with `PAPERCLIP_ALLOWED_HOSTNAMES=app.vercel.app` and frontend to Vercel with `VITE_API_URL=https://<railway-host>`. From the Vercel URL, open DevTools Network tab and perform a login or any authenticated API call.
**Expected:** Preflight OPTIONS request returns `Access-Control-Allow-Origin: https://app.vercel.app` and `Access-Control-Allow-Credentials: true`; subsequent GET/POST calls succeed with session cookie attached.
**Why human:** Cannot verify real cross-origin HTTP behavior, Railway environment variables, or actual browser cookie behavior programmatically.

#### 2. SameSite=None cookie in browser

**Test:** With the cross-origin production setup above, inspect the `Set-Cookie` header returned by the auth endpoint (e.g., login).
**Expected:** Cookie header includes `SameSite=None; Secure`.
**Why human:** Cookie attribute verification requires an actual HTTPS response in a browser context; the test only verifies the config object passed to BetterAuth.

#### 3. Direct-URL navigation on Vercel

**Test:** Navigate directly to `https://app.vercel.app/some/deep/route` (not through in-app links).
**Expected:** Page loads correctly (React Router handles the route); no 404 from Vercel CDN.
**Why human:** SPA rewrite behavior requires actual Vercel deployment to verify.

---

### Gaps Summary

No gaps. All truths verified, all artifacts substantive and wired, all key links confirmed, all 10 requirements satisfied. Three items flagged for human verification are optional smoke tests for the production deployment — they do not block readiness.

---

### Commit Verification

All 5 commits documented in phase SUMMARYs confirmed present in git history:

| Hash | Description |
|------|-------------|
| `9301a665` | test(05-01): add failing tests for CORS, cookie config, and secret validation |
| `7bf254b9` | feat(05-01): wire CORS, BetterAuth cookies, secret validation, and mutation guard for cross-origin |
| `0518fb32` | test(05-02): add failing tests for API_BASE and getWsHost |
| `fbc17d32` | feat(05-02): create api-base module and update REST callers |
| `8e58a867` | feat(05-02): update WebSocket URLs to use getWsHost() and add vercel.json |

---

_Verified: 2026-04-04T14:30:30Z_
_Verifier: Claude (gsd-verifier)_
