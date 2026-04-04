# Roadmap: Human Agents for Paperclip

## Milestones

- ✅ **v1.0 Human Agents MVP** — Phases 1-4 (shipped 2026-04-04)
- 🚧 **v1.1 Deployment & SaaS Readiness** — Phases 5-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 Human Agents MVP (Phases 1-4) — SHIPPED 2026-04-04</summary>

- [x] Phase 1: Identity, Membership & My Tasks Foundation (3/3 plans) — completed 2026-04-03
- [x] Phase 2: Task Work Surface (3/3 plans) — completed 2026-04-04
- [x] Phase 3: Owner Team Visibility (3/3 plans) — completed 2026-04-04
- [x] Phase 4: Online Deployment & Multi-User Auth (2/2 plans) — completed 2026-04-04

See: milestones/v1.0-ROADMAP.md for full phase details

</details>

### 🚧 v1.1 Deployment & SaaS Readiness (In Progress)

**Milestone Goal:** Deploy Paperclip for real multi-user testing — frontend on Vercel CDN, backend on Railway, Supabase as global database, API Gateway middleware, Redis cache layer. The full invite → join → work → handoff cycle verified against a live production-like deployment.

- [ ] **Phase 5: Cross-Origin Code Preparation** — Fix all code-level blockers so the frontend can talk to a separately-hosted backend
- [ ] **Phase 6: Infrastructure Provisioning & Deployment** — Provision Supabase, Railway, Vercel; wire env vars; achieve a live multi-tier deployment
- [ ] **Phase 7: End-to-End Verification** — Validate the full invite → join → work → handoff cycle on the live deployment
- [ ] **Phase 8: API Hardening & Redis** — Add rate limiting, security headers, and Redis cache layer after base deployment is stable

## Phase Details

### Phase 5: Cross-Origin Code Preparation
**Goal**: All code-level changes required for cross-origin operation are in place and verifiable before any cloud infrastructure is touched
**Depends on**: Phase 4 (v1.0)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-06, DEPLOY-08, AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. Frontend Vite build succeeds with `VITE_API_URL` set to an external URL — no 404 on direct navigation (vercel.json rewrite rule present)
  2. All API calls in `client.ts` and `auth.ts` use `VITE_API_URL` as base — no hardcoded `/api` relative paths remain
  3. All three WebSocket URL constructions (LiveUpdatesProvider, useLiveRunTranscripts, AgentDetail) derive host from `VITE_API_URL`, not `window.location.host`
  4. BetterAuth cookie config emits `SameSite=None; Secure` — cross-origin session cookies will be accepted by browsers
  5. CORS middleware in `app.ts` accepts credentialed requests from the configured allowed origin; `BETTER_AUTH_SECRET` has no hardcoded fallback
**Plans**: TBD

### Phase 6: Infrastructure Provisioning & Deployment
**Goal**: Supabase, Railway, and Vercel are all live with correct env vars wired between them, and the backend responds to authenticated API requests from the Vercel frontend
**Depends on**: Phase 5
**Requirements**: DEPLOY-05, DEPLOY-07, DEPLOY-09, DEPLOY-10, DEPLOY-11, AUTH-05
**Success Criteria** (what must be TRUE):
  1. Supabase PostgreSQL is provisioned and the full schema is migrated — backend boots against Supabase without schema errors
  2. Railway container is running with `SERVE_UI=false`; `GET /health` returns 200 and Railway health checks pass
  3. Vercel deployment completes with `VITE_API_URL` pointing to Railway; direct-navigation to any route returns the app (not a 404)
  4. A user can sign up and log in from the Vercel frontend to the Railway backend — session cookie is set and persists across page refreshes
**Plans**: TBD

### Phase 7: End-to-End Verification
**Goal**: The complete multi-user workflow (owner invites, user joins, task assigned, task worked, handoff to AI agent, real-time updates) is verified on the live deployment
**Depends on**: Phase 6
**Requirements**: E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06
**Success Criteria** (what must be TRUE):
  1. Owner can generate and send an invite link from the Vercel frontend; invited user receives a functional link
  2. Invited user follows the link, signs up, accepts the invite, and sees their My Tasks dashboard populated correctly
  3. Owner can assign a task to the invited user; the task appears in the user's My Tasks dashboard
  4. Invited user can change task status, attach a file, and create a subtask — all changes persist on reload
  5. Invited user can reassign a task to an AI agent; the agent receives the task and the handoff warning dialog appears
  6. Real-time WebSocket updates (task state changes) are visible to both users without a page refresh
**Plans**: TBD

### Phase 8: API Hardening & Redis
**Goal**: The API layer is resilient to abuse and performant under real load — rate limiting is distributed via Redis, security headers protect all responses, and frequently-read data is cached
**Depends on**: Phase 7
**Requirements**: HARD-01, HARD-02, HARD-03, REDIS-01, REDIS-02, REDIS-03
**Success Criteria** (what must be TRUE):
  1. All API responses include HTTP security headers (HSTS, X-Frame-Options, X-Content-Type-Options, CSP) from `helmet`
  2. Repeated rapid requests from the same IP are throttled by `express-rate-limit` — after exceeding the threshold, subsequent requests receive 429 responses
  3. Rate limit counters survive a Railway container restart — counters persist in Redis, not in-process memory
  4. Redis client connects on Railway private network with reconnection handling; connection errors are logged but do not crash the server
  5. At least one read-heavy endpoint returns cached data from Redis on repeat requests — observable via reduced Supabase query latency or cache-hit logs
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Identity, Membership & My Tasks Foundation | v1.0 | 3/3 | Complete | 2026-04-03 |
| 2. Task Work Surface | v1.0 | 3/3 | Complete | 2026-04-04 |
| 3. Owner Team Visibility | v1.0 | 3/3 | Complete | 2026-04-04 |
| 4. Online Deployment & Multi-User Auth | v1.0 | 2/2 | Complete | 2026-04-04 |
| 5. Cross-Origin Code Preparation | v1.1 | 0/TBD | Not started | - |
| 6. Infrastructure Provisioning & Deployment | v1.1 | 0/TBD | Not started | - |
| 7. End-to-End Verification | v1.1 | 0/TBD | Not started | - |
| 8. API Hardening & Redis | v1.1 | 0/TBD | Not started | - |
