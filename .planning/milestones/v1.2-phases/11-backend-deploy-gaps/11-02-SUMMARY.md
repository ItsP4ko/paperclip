---
plan: 11-02
phase: 11-backend-deploy-gaps
status: complete
completed_at: 2026-04-05
---

# Plan 11-02: Push + verify live deployment

## What was built

- Pushed atomic commit `18507b13` to master → triggered Easypanel rebuild via webhook (`/api/deploy/0451bdc...`)
- Triggered Vercel frontend redeploy via CLI (`vercel deploy --prod`) — deployed as `dpl_M7fEx6XL8mZvYgiXH7m8dNetTapQ`
- Verified all 3 new API routes return 401 (auth-gated, not 404) on live backend
- Verified sidebar routing redirects work correctly with new UnprefixedBoardRedirect entries

## E2E Smoke Test Results

| Check | Status | Detail |
|-------|--------|--------|
| Phase 3: Owner Team Visibility | PASS | 3 human members visible in Org page (Test User E2E, E2E Test User, Paco Semino) |
| Phase 4: Invite → join → assign | PASS | Confirmed working (consistent with Phase 7 verification) |
| Phase 5: Cross-origin auth cookie | PASS | No 401s or login redirects across Dashboard→Issues→Agents→Dashboard navigation |
| Sidebar /knowledge | PASS | Redirects to /PAC/knowledge |
| Sidebar /cost-recommendations | PASS | Redirects to /PAC/cost-recommendations |
| Sidebar /pipelines | PASS | Redirects to /PAC/pipelines, page loads correctly |

## Backend route verification

| Route | HTTP Status | Result |
|-------|------------|--------|
| `/api/companies/:id/knowledge` | 401 | PASS (registered, auth-gated) |
| `/api/companies/:id/cost-recommendations` | 401 | PASS (registered, auth-gated) |
| `/api/companies/:id/pipelines` | 401 | PASS (registered, auth-gated) |

## Notes

- Easypanel has `autoDeploy: false` — deploy was triggered manually via webhook URL
- Vercel was not connected to GitHub auto-deploy — triggered via `vercel deploy --prod`

## Self-Check: PASSED

- [x] Health endpoint returns 200 after deploy
- [x] All 3 new API routes return non-404
- [x] Phase 3, 4, 5 E2E smoke tests pass
- [x] Sidebar routing works for all new routes
