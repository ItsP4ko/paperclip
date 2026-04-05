---
phase: 06-infrastructure-provisioning-deployment
plan: 03
subsystem: infra
tags: [railway, vercel, deployment, cors, betterauth, docker]

requires:
  - phase: 06-infrastructure-provisioning-deployment
    provides: "Supabase PostgreSQL provisioned with all migrations (plan 02), connection pool capped (plan 01)"
provides:
  - "Railway backend deployment with health checks and public networking"
  - "Vercel frontend deployment with build-time VITE_API_URL"
  - "Cross-origin auth flow (sign-up, sign-in, session persistence)"
affects: [custom-domains, monitoring, saas-features]

tech-stack:
  added: [railway, vercel]
  patterns: [three-tier-deployment, cross-origin-auth, build-time-env-vars]

key-files:
  created: []
  modified: []

key-decisions:
  - "Railway deploys from Dockerfile at repo root with SERVE_UI=false"
  - "Vercel root directory set to ui/ with Vite framework preset"
  - "VITE_API_URL set as build-time env var before first Vercel deploy"
  - "PAPERCLIP_ALLOWED_HOSTNAMES includes healthcheck.railway.app for health check access"
  - "BetterAuth cookies use SameSite=None; Secure for cross-origin flow"

patterns-established:
  - "Three-tier deployment: Vercel (CDN/SPA) → Railway (API) → Supabase (DB)"
  - "Build-time env vars for Vite must be set before deploy, not after"

requirements-completed: [DEPLOY-05, DEPLOY-07, AUTH-05]

duration: N/A (human-action tasks)
completed: 2026-04-04
---

# Plan 06-03: Deploy to Railway + Vercel Summary

**Three-tier deployment live — Railway serves Express API, Vercel serves Vite SPA, cross-origin BetterAuth sign-up/sign-in/session verified end-to-end**

## Performance

- **Duration:** Manual deployment (human-action tasks)
- **Tasks:** 3
- **Files modified:** 0 (infrastructure-only, no code changes)

## Accomplishments
- Railway backend deployed with Docker, health checks passing at /api/health
- Vercel frontend deployed with VITE_API_URL baked at build time pointing to Railway
- Cross-origin auth verified: sign-up, sign-in, and session persistence across refresh all working
- CORS and trusted origins properly configured between Vercel and Railway

## Task Commits

All tasks were human-action checkpoints (no code commits):

1. **Task 1: Deploy backend to Railway** - Railway service created, env vars configured, health check returns 200
2. **Task 2: Deploy frontend to Vercel** - Vercel project created, VITE_API_URL set, SPA loads, PAPERCLIP_ALLOWED_HOSTNAMES updated
3. **Task 3: Verify cross-origin auth flow** - Sign-up, sign-in, session persistence all verified in browser

## Files Created/Modified
- No code files modified — this was an infrastructure provisioning plan

## Decisions Made
- Used Railway's auto-deploy from GitHub with Dockerfile detection
- Set Vercel root directory to `ui/` with Vite preset
- Included `healthcheck.railway.app` in allowed hostnames for Railway health checks

## Deviations from Plan
None - plan executed as written.

## Issues Encountered
None

## Next Phase Readiness
- Full three-tier deployment is operational
- Ready for custom domain setup, monitoring, or SaaS features

---
*Phase: 06-infrastructure-provisioning-deployment*
*Completed: 2026-04-04*
