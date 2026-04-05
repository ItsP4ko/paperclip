# Requirements: Paperclip v1.1

**Defined:** 2026-04-04
**Core Value:** A human can receive, work on, and complete tasks inside Paperclip exactly as an AI agent does — without friction, from the web app.

## v1.1 Requirements

Requirements for deployment & SaaS readiness. Each maps to roadmap phases.

### Deployment — Frontend (Vercel)

- [x] **DEPLOY-01**: Frontend deployed to Vercel as SPA with correct rewrite rules (no 404 on direct navigation)
- [x] **DEPLOY-02**: All API calls in frontend use configurable `VITE_API_URL` instead of relative paths
- [x] **DEPLOY-03**: WebSocket URLs in frontend point to backend host, not CDN host (3 files: LiveUpdatesProvider, useLiveRunTranscripts, AgentDetail)
- [x] **DEPLOY-04**: Frontend build succeeds on Vercel with correct environment variables

### Deployment — Backend (Easypanel)

- [x] **DEPLOY-05**: Backend deployed to Easypanel using existing Dockerfile with `SERVE_UI=false`
- [x] **DEPLOY-06**: Health check endpoint (`GET /health`) responds correctly for Railway container readiness
- [x] **DEPLOY-07**: All required environment variables configured in Easypanel (DATABASE_URL, BETTER_AUTH_SECRET, PAPERCLIP_DEPLOYMENT_MODE, etc.)
- [x] **DEPLOY-08**: Backend reads `PORT` from environment (Railway overrides at runtime)

### Deployment — Database (Supabase)

- [x] **DEPLOY-09**: Supabase PostgreSQL provisioned and schema migrated (manual SQL execution)
- [x] **DEPLOY-10**: Backend connects to Supabase via session-mode pooler (port 5432) with pool size cap
- [x] **DEPLOY-11**: Existing data model works on Supabase without schema changes

### Cross-Origin Auth & Security

- [x] **AUTH-01**: CORS middleware configured to allow Vercel frontend origin with credentials
- [x] **AUTH-02**: BetterAuth cookies set to `SameSite=None; Secure` for cross-origin auth
- [x] **AUTH-03**: `PAPERCLIP_ALLOWED_HOSTNAMES` includes Vercel domain so boardMutationGuard accepts requests
- [x] **AUTH-04**: `BETTER_AUTH_SECRET` set to a secure random value (no fallback to hardcoded dev secret)
- [x] **AUTH-05**: User can sign up and log in from Vercel-hosted frontend to Easypanel-hosted backend

### API Hardening

- [x] **HARD-01**: Rate limiting middleware (`express-rate-limit`) protects API endpoints with per-IP throttling
- [x] **HARD-02**: Security headers middleware (`helmet`) applied to all responses
- [x] **HARD-03**: Rate limit state stored in Redis (`rate-limit-redis`) for persistence across restarts

### Redis Cache

- [x] **REDIS-01**: Redis instance provisioned (Railway addon)
- [x] **REDIS-02**: Redis client (`node-redis` v5) connected with reconnection handling
- [x] **REDIS-03**: Frequently-queried global data cached in Redis with appropriate TTL

### End-to-End Verification

- [x] **E2E-01**: Owner can invite a new user from Vercel frontend
- [x] **E2E-02**: Invited user can sign up, accept invite, and see their dashboard
- [x] **E2E-03**: Owner can assign a task to the invited user
- [x] **E2E-04**: Invited user can change task status, attach files, create subtasks
- [x] **E2E-05**: User can reassign a task to an AI agent (bidirectional handoff works)
- [x] **E2E-06**: Real-time updates (WebSocket) work across the deployed stack

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
| DEPLOY-01 | Phase 5 | Complete |
| DEPLOY-02 | Phase 5 | Complete |
| DEPLOY-03 | Phase 5 | Complete |
| DEPLOY-04 | Phase 5 | Complete |
| DEPLOY-05 | Phase 6 | Complete |
| DEPLOY-06 | Phase 5 | Complete |
| DEPLOY-07 | Phase 6 | Complete |
| DEPLOY-08 | Phase 5 | Complete |
| DEPLOY-09 | Phase 6 | Complete |
| DEPLOY-10 | Phase 6 | Complete |
| DEPLOY-11 | Phase 6 | Complete |
| AUTH-01 | Phase 5 | Complete |
| AUTH-02 | Phase 5 | Complete |
| AUTH-03 | Phase 5 | Complete |
| AUTH-04 | Phase 5 | Complete |
| AUTH-05 | Phase 6 | Complete |
| HARD-01 | Phase 8 | Complete |
| HARD-02 | Phase 8 | Complete |
| HARD-03 | Phase 8 | Complete |
| REDIS-01 | Phase 8 | Complete |
| REDIS-02 | Phase 8 | Complete |
| REDIS-03 | Phase 8 | Complete |
| E2E-01 | Phase 7 | Complete |
| E2E-02 | Phase 7 | Complete |
| E2E-03 | Phase 7 | Complete |
| E2E-04 | Phase 9 (gap closure) | Complete |
| E2E-05 | Phase 9 (gap closure) | Complete |
| E2E-06 | Phase 9 (gap closure) | Complete |

**Coverage:**
- v1.1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-05 -- E2E-04, E2E-05, E2E-06 marked complete; all 28 v1.1 requirements now [x]*
