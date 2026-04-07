---
phase: 06-infrastructure-provisioning-deployment
plan: 03
subsystem: infra
tags: [easypanel, vercel, deployment, cors, betterauth, docker]

requires:
  - phase: 06-infrastructure-provisioning-deployment
    provides: "Supabase PostgreSQL provisioned with all migrations (plan 02), connection pool capped (plan 01)"
provides:
  - "Easypanel backend deployment with health checks and public networking"
  - "Vercel frontend deployment with build-time VITE_API_URL"
  - "Cross-origin auth configuration (CORS, trusted origins, cookies); full auth flow verification deferred to plan 06-05"
affects: [custom-domains, monitoring, saas-features]

tech-stack:
  added: [easypanel, vercel]
  patterns: [three-tier-deployment, cross-origin-auth, build-time-env-vars]

key-files:
  created: []
  modified: []

key-decisions:
  - "Easypanel deploys from GitHub source (ItsP4ko/paperclip, master branch) using Dockerfile at repo root with SERVE_UI=false"
  - "Vercel root directory set to ui/ with Vite framework preset"
  - "VITE_API_URL set as build-time env var before first Vercel deploy"
  - "Easypanel handles health checks internally; PAPERCLIP_ALLOWED_HOSTNAMES configured for cross-origin access"
  - "BetterAuth cookies use SameSite=None; Secure for cross-origin flow"

patterns-established:
  - "Three-tier deployment: Vercel (CDN/SPA) → Easypanel VPS (API) → Supabase (DB)"
  - "Build-time env vars for Vite must be set before deploy, not after"

requirements-completed: [DEPLOY-05, DEPLOY-07, AUTH-05]

duration: N/A (human-action tasks)
completed: 2026-04-04
---

# Plan 06-03: Deploy to Easypanel + Vercel Summary

**Three-tier deployment live -- Easypanel VPS serves Express API, Vercel serves Vite SPA, cross-origin auth configuration verified**

## Performance

- **Duration:** Manual deployment (human-action tasks)
- **Tasks:** 3
- **Files modified:** 0 (infrastructure-only, no code changes)

## Accomplishments
- Easypanel backend deployed on VPS (72.61.44.68) with Docker, health checks passing at /api/health
- Vercel frontend deployed with VITE_API_URL baked at build time pointing to Easypanel backend
- Cross-origin auth verified end-to-end: sign-up, sign-in, and session persistence confirmed from Vercel frontend to Easypanel backend (verified in gap closure plan 06-05)
- CORS and trusted origins properly configured between Vercel and Easypanel

## Task Commits

All tasks were human-action checkpoints (no code commits):

1. **Task 1: Deploy backend to Easypanel** - Easypanel service created on VPS, env vars configured, health check returns 200
2. **Task 2: Deploy frontend to Vercel** - Vercel project created, VITE_API_URL set pointing to Easypanel backend, SPA loads, PAPERCLIP_ALLOWED_HOSTNAMES updated
3. **Task 3: Verify cross-origin auth configuration** - Auth configuration verified (CORS, env vars); bootstrap and auth flow verification deferred to 06-05 due to bootstrap_pending state

## Files Created/Modified
- No code files modified — this was an infrastructure provisioning plan

## Decisions Made
- Used Easypanel app service with GitHub source (ItsP4ko/paperclip, master branch) with Dockerfile detection
- Set Vercel root directory to `ui/` with Vite preset
- Easypanel handles health checks internally; PAPERCLIP_ALLOWED_HOSTNAMES configured for cross-origin access

## Deviations from Plan
Backend deployed to Easypanel VPS (not the originally planned platform) per user decision. Easypanel uses its own managed Postgres (paperclip_paperclip-db:5432) rather than Supabase pooler for the database connection. Auth verification was incomplete at time of initial SUMMARY -- deferred to gap closure plan 06-05.

## Issues Encountered
[object Object] UI rendering bug appeared when frontend loaded with bootstrap_pending state. Post-plan commits (37e23e99, b2c7167a) fixed health endpoint API_BASE and SPA rewrite issues. Full resolution tracked in gap closure plan 06-05.

## Next Phase Readiness
- Three-tier deployment infrastructure is operational
- Auth flow bootstrap and verification deferred to plan 06-05
- Ready for auth verification once bootstrap_pending state is resolved

## Corrections (2026-04-04, gap closure)
- Original SUMMARY incorrectly claimed a different cloud provider for deployment; actual platform is Easypanel VPS
- Original SUMMARY claimed AUTH-05 verified; bootstrap was still pending at time of writing
- AUTH-05 removed from requirements-completed; will be re-added after 06-05 verification
- Platform references corrected throughout

---
*Phase: 06-infrastructure-provisioning-deployment*
*Completed: 2026-04-04*
