# Requirements: Paperclip v1.1

**Defined:** 2026-04-04
**Core Value:** A human can receive, work on, and complete tasks inside Paperclip exactly as an AI agent does — without friction, from the web app.

## v1.1 Requirements

Requirements for deployment & SaaS readiness. Each maps to roadmap phases.

### Deployment — Frontend (Vercel)

- [ ] **DEPLOY-01**: Frontend deployed to Vercel as SPA with correct rewrite rules (no 404 on direct navigation)
- [ ] **DEPLOY-02**: All API calls in frontend use configurable `VITE_API_URL` instead of relative paths
- [ ] **DEPLOY-03**: WebSocket URLs in frontend point to backend host, not CDN host (3 files: LiveUpdatesProvider, useLiveRunTranscripts, AgentDetail)
- [ ] **DEPLOY-04**: Frontend build succeeds on Vercel with correct environment variables

### Deployment — Backend (Railway)

- [ ] **DEPLOY-05**: Backend deployed to Railway using existing Dockerfile with `SERVE_UI=false`
- [ ] **DEPLOY-06**: Health check endpoint (`GET /health`) responds correctly for Railway container readiness
- [ ] **DEPLOY-07**: All required environment variables configured in Railway (DATABASE_URL, BETTER_AUTH_SECRET, PAPERCLIP_DEPLOYMENT_MODE, etc.)
- [ ] **DEPLOY-08**: Backend reads `PORT` from environment (Railway overrides at runtime)

### Deployment — Database (Supabase)

- [ ] **DEPLOY-09**: Supabase PostgreSQL provisioned and schema migrated (manual SQL execution)
- [ ] **DEPLOY-10**: Backend connects to Supabase via session-mode pooler (port 5432) with pool size cap
- [ ] **DEPLOY-11**: Existing data model works on Supabase without schema changes

### Cross-Origin Auth & Security

- [ ] **AUTH-01**: CORS middleware configured to allow Vercel frontend origin with credentials
- [ ] **AUTH-02**: BetterAuth cookies set to `SameSite=None; Secure` for cross-origin auth
- [ ] **AUTH-03**: `PAPERCLIP_ALLOWED_HOSTNAMES` includes Vercel domain so boardMutationGuard accepts requests
- [ ] **AUTH-04**: `BETTER_AUTH_SECRET` set to a secure random value (no fallback to hardcoded dev secret)
- [ ] **AUTH-05**: User can sign up and log in from Vercel-hosted frontend to Railway-hosted backend

### API Hardening

- [ ] **HARD-01**: Rate limiting middleware (`express-rate-limit`) protects API endpoints with per-IP throttling
- [ ] **HARD-02**: Security headers middleware (`helmet`) applied to all responses
- [ ] **HARD-03**: Rate limit state stored in Redis (`rate-limit-redis`) for persistence across restarts

### Redis Cache

- [ ] **REDIS-01**: Redis instance provisioned (Railway addon)
- [ ] **REDIS-02**: Redis client (`node-redis` v5) connected with reconnection handling
- [ ] **REDIS-03**: Frequently-queried global data cached in Redis with appropriate TTL

### End-to-End Verification

- [ ] **E2E-01**: Owner can invite a new user from Vercel frontend
- [ ] **E2E-02**: Invited user can sign up, accept invite, and see their dashboard
- [ ] **E2E-03**: Owner can assign a task to the invited user
- [ ] **E2E-04**: Invited user can change task status, attach files, create subtasks
- [ ] **E2E-05**: User can reassign a task to an AI agent (bidirectional handoff works)
- [ ] **E2E-06**: Real-time updates (WebSocket) work across the deployed stack

## v1.2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Production Polish

- **PROD-01**: Custom domains for frontend and backend
- **PROD-02**: S3/R2 for file storage in production (replace local filesystem)
- **PROD-03**: Preview deployment CORS (dynamic origin matching)
- **PROD-04**: Horizontal scaling for backend (stateless session validation)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Stripe / billing | Deferred — exploring business model first |
| Row-Level Security (RLS) | Future SaaS hardening — single-tenant testing first |
| Kubernetes / container orchestration | Railway handles this; premature at current scale |
| CI/CD pipeline | Manual deploys sufficient for testing phase |
| Custom API Gateway service (Kong, Envoy) | Express middleware covers all needs at this scale |
| Mobile app | Web-first, mobile later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEPLOY-01 | — | Pending |
| DEPLOY-02 | — | Pending |
| DEPLOY-03 | — | Pending |
| DEPLOY-04 | — | Pending |
| DEPLOY-05 | — | Pending |
| DEPLOY-06 | — | Pending |
| DEPLOY-07 | — | Pending |
| DEPLOY-08 | — | Pending |
| DEPLOY-09 | — | Pending |
| DEPLOY-10 | — | Pending |
| DEPLOY-11 | — | Pending |
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| AUTH-04 | — | Pending |
| AUTH-05 | — | Pending |
| HARD-01 | — | Pending |
| HARD-02 | — | Pending |
| HARD-03 | — | Pending |
| REDIS-01 | — | Pending |
| REDIS-02 | — | Pending |
| REDIS-03 | — | Pending |
| E2E-01 | — | Pending |
| E2E-02 | — | Pending |
| E2E-03 | — | Pending |
| E2E-04 | — | Pending |
| E2E-05 | — | Pending |
| E2E-06 | — | Pending |

**Coverage:**
- v1.1 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28 ⚠️

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after initial definition*
