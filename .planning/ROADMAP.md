# Roadmap: Human Agents for Paperclip

## Milestones

- ✅ **v1.0 Human Agents MVP** — Phases 1-4 (shipped 2026-04-04)
- ✅ **v1.1 Deployment & SaaS Readiness** — Phases 5-9 (shipped 2026-04-05)
- 🚧 **v1.2 Performance & Mobile Fix** — Phases 10-14 (in progress)

## Phases

<details>
<summary>✅ v1.0 Human Agents MVP (Phases 1-4) — SHIPPED 2026-04-04</summary>

- [x] Phase 1: Identity, Membership & My Tasks Foundation (3/3 plans) — completed 2026-04-03
- [x] Phase 2: Task Work Surface (3/3 plans) — completed 2026-04-04
- [x] Phase 3: Owner Team Visibility (3/3 plans) — completed 2026-04-04
- [x] Phase 4: Online Deployment & Multi-User Auth (2/2 plans) — completed 2026-04-04

See: milestones/v1.0-ROADMAP.md for full phase details

</details>

<details>
<summary>✅ v1.1 Deployment & SaaS Readiness (Phases 5-9) — SHIPPED 2026-04-05</summary>

- [x] Phase 5: Cross-Origin Code Preparation (2/2 plans) — completed 2026-04-04
- [x] Phase 6: Infrastructure Provisioning & Deployment (5/5 plans) — completed 2026-04-05
- [x] Phase 7: End-to-End Verification (2/2 plans) — completed 2026-04-05
- [x] Phase 8: API Hardening & Redis (2/2 plans) — completed 2026-04-05
- [x] Phase 9: Gap Closure — Rate-Limit Fix & E2E Completion (2/2 plans) — completed 2026-04-05

See: milestones/v1.1-ROADMAP.md for full phase details

</details>

### v1.2 Performance & Mobile Fix (In Progress)

**Milestone Goal:** Make every interaction feel instant via optimistic UI and aggressive caching, and fix cross-origin auth so mobile browsers can log in.

- [x] **Phase 10: Optimistic UI Mutations** - Status/assignment/subtask changes reflect immediately; rollback on failure; WS race guarded (completed 2026-04-05)
- [x] **Phase 11: Backend Deploy Gaps** - Redeploy Easypanel backend with missing routes; fix sidebar routing; re-run E2E for phases 3, 4, 5 (completed 2026-04-05)
- [x] **Phase 12: Aggressive Caching** - Navigation between previously-visited pages is instant; My Tasks renders correctly (completed 2026-04-05)
- [x] **Phase 13: Mobile Cross-Origin Auth** - iOS Safari and Android Chrome users can log in and maintain authenticated sessions (completed 2026-04-05)
- [ ] **Phase 14: WebSocket Optimization** - Dead connections detected and reconnected; per-message latency reduced; cache recovered after reconnect

## Phase Details

### Phase 10: Optimistic UI Mutations
**Goal**: Users see their actions reflected immediately in the UI — status changes, assignments, and new subtasks appear without waiting for the server, with visible rollback on failure
**Depends on**: Phase 9 (v1.1 complete)
**Requirements**: OPTM-01, OPTM-02, OPTM-03, OPTM-04, OPTM-05
**Success Criteria** (what must be TRUE):
  1. User changes an issue status and the new status appears in the UI immediately — no loading spinner or delay visible
  2. User reassigns an issue and the new assignee reflects in the issue detail without waiting for server confirmation
  3. User creates a subtask and it appears in the subtask list before the server responds
  4. When a mutation fails (simulated network error), the UI reverts to the previous state and shows an error message
  5. While a status or assignment mutation is in flight, a WebSocket `activity.logged` event does not overwrite the optimistic value
**Plans:** 2/2 plans complete
Plans:
- [x] 10-01-PLAN.md — Optimistic mutation utilities + rewire IssueDetail.tsx mutations
- [x] 10-02-PLAN.md — isMutating guard in LiveUpdatesProvider + human verification

### Phase 11: Backend Deploy Gaps
**Goal**: Easypanel backend is redeployed with all routes active (Knowledge Base, Cost Recommendations, Pipelines), sidebar routing is fixed to use company-prefixed paths, and E2E verification for phases 3, 4, and 5 is re-run and passing
**Depends on**: Phase 10
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03
**Success Criteria** (what must be TRUE):
  1. Knowledge Base, Cost Recommendations, and Pipelines routes are registered on the live Easypanel backend and return non-404 responses
  2. Sidebar links use company-prefixed paths (e.g., `/PAC/knowledge-base`) so navigation works correctly end-to-end
  3. E2E tests for Phase 3 (Owner Team Visibility), Phase 4 (Multi-User Auth), and Phase 5 (Cross-Origin) pass on the live deployment
**Plans:** 2/2 plans complete
Plans:
- [ ] 11-01-PLAN.md — Migration + sidebar redirect fix + atomic commit
- [ ] 11-02-PLAN.md — Deploy to Easypanel + route verification + E2E smoke tests

### Phase 12: Aggressive Caching
**Goal**: Navigating between pages that have been visited before is instant, with no loading skeleton, and the My Tasks page renders assigned issues correctly
**Depends on**: Phase 11
**Requirements**: CACHE-01, CACHE-02, CACHE-03, CACHE-04
**Success Criteria** (what must be TRUE):
  1. User navigates away from an issue list and returns within 5 minutes — data appears instantly without a loading spinner
  2. User opens a previously-visited issue detail — it renders instantly without a skeleton screen
  3. My Tasks page shows the correct list of assigned issues (matches the sidebar badge count)
  4. After a user performs any mutation (status change, assignment, subtask creation), the relevant list and detail pages reflect the updated data — no stale values shown
**Plans:** 2/2 plans complete
Plans:
- [ ] 12-01-PLAN.md — Per-query staleTime: 120_000 on issue list and detail queries (CACHE-01, CACHE-02)
- [ ] 12-02-PLAN.md — Add listAssignedToMe invalidation to all missing call-sites (CACHE-03, CACHE-04)

### Phase 13: Mobile Cross-Origin Auth
**Goal**: Users on iOS Safari and Android Chrome can log in to Paperclip and maintain an authenticated session, including real-time WebSocket updates
**Depends on**: Phase 12
**Requirements**: MAUTH-01, MAUTH-02, MAUTH-03, MAUTH-04, MAUTH-05
**Success Criteria** (what must be TRUE):
  1. A user on iOS Safari with default privacy settings can sign in and stay logged in across page navigations
  2. A user on Android Chrome can sign in and stay logged in across page navigations
  3. Frontend and backend are accessible under the same root domain so Safari ITP does not block session cookies
  4. WebSocket connections from mobile sessions receive real-time updates (user session token validated in WS upgrade, not only agent API keys)
  5. Navigating directly to a nested route (e.g., `/PAC/dashboard`) on Vercel loads the correct page instead of a 404
**Plans:** 2/2 plans complete
Plans:
- [ ] 13-01-PLAN.md — Server-side bearer auth + WS user session auth (MAUTH-01, MAUTH-02, MAUTH-03, MAUTH-04)
- [ ] 13-02-PLAN.md — Frontend bearer injection + WS token + Vercel SPA routing (MAUTH-01, MAUTH-02, MAUTH-04, MAUTH-05)

### Phase 14: WebSocket Optimization
**Goal**: WebSocket connections are reliable — dead connections are detected and recovered, per-message latency is reduced, and the client cache is restored after a reconnect
**Depends on**: Phase 13
**Requirements**: WS-01, WS-02, WS-03
**Success Criteria** (what must be TRUE):
  1. After a network drop or silent NAT timeout, the client detects the dead connection within 25 seconds and automatically reconnects without user action
  2. WebSocket message round-trip latency on the live Easypanel deployment is measurably lower than before (`perMessageDeflate` disabled)
  3. After a WebSocket reconnect, any issues or lists the user has open reflect the current server state — events missed during the disconnect window are not silently lost
**Plans:** 1/2 plans executed
Plans:
- [ ] 14-01-PLAN.md — Explicit perMessageDeflate: false in WS server constructor (WS-02)
- [ ] 14-02-PLAN.md — Client heartbeat for dead-connection detection + cache invalidation on reconnect (WS-01, WS-03)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Identity, Membership & My Tasks Foundation | v1.0 | 3/3 | Complete | 2026-04-03 |
| 2. Task Work Surface | v1.0 | 3/3 | Complete | 2026-04-04 |
| 3. Owner Team Visibility | v1.0 | 3/3 | Complete | 2026-04-04 |
| 4. Online Deployment & Multi-User Auth | v1.0 | 2/2 | Complete | 2026-04-04 |
| 5. Cross-Origin Code Preparation | v1.1 | 2/2 | Complete | 2026-04-04 |
| 6. Infrastructure Provisioning & Deployment | v1.1 | 5/5 | Complete | 2026-04-05 |
| 7. End-to-End Verification | v1.1 | 2/2 | Complete | 2026-04-05 |
| 8. API Hardening & Redis | v1.1 | 2/2 | Complete | 2026-04-05 |
| 9. Gap Closure — Rate-Limit Fix & E2E Completion | v1.1 | 2/2 | Complete | 2026-04-05 |
| 10. Optimistic UI Mutations | v1.2 | Complete    | 2026-04-05 | 2026-04-05 |
| 11. Backend Deploy Gaps | v1.2 | Complete    | 2026-04-05 | - |
| 12. Aggressive Caching | 2/2 | Complete    | 2026-04-05 | - |
| 13. Mobile Cross-Origin Auth | 2/2 | Complete    | 2026-04-06 | - |
| 14. WebSocket Optimization | 1/2 | In Progress|  | - |
