# Requirements: Paperclip v1.2

**Defined:** 2026-04-05
**Core Value:** A human can receive, work on, and complete tasks inside Paperclip exactly as an AI agent does — without friction, from the web app.

## v1.2 Requirements

Requirements for v1.2 Performance & Mobile Fix milestone.

### Optimistic UI

- [ ] **OPTM-01**: User sees status change reflected immediately in the UI without waiting for server confirmation
- [ ] **OPTM-02**: User sees assignee change reflected immediately on issue detail without waiting for server confirmation
- [ ] **OPTM-03**: User sees newly created subtask appear in list before server confirms creation
- [ ] **OPTM-04**: Failed mutations auto-rollback to previous state with visible error feedback
- [ ] **OPTM-05**: WS-driven cache invalidations do not overwrite in-flight optimistic mutations (isMutating guard)

### Caching

- [ ] **CACHE-01**: Issue lists are cached for 2 minutes — navigating back to a list shows data instantly without spinner
- [ ] **CACHE-02**: Issue detail is cached for 2 minutes — reopening a previously-visited issue is instant
- [ ] **CACHE-03**: My Tasks page renders assigned issues correctly (fix: currently renders empty despite badge count showing tasks)
- [ ] **CACHE-04**: Cache invalidates correctly after any mutation — no stale data shown to user after a change

### Mobile Auth

- [ ] **MAUTH-01**: User on iOS Safari can log in and maintain an authenticated session (currently stuck on login screen)
- [ ] **MAUTH-02**: User on Android Chrome can log in and maintain an authenticated session
- [ ] **MAUTH-03**: Frontend and backend are served under the same root custom domain to resolve Safari ITP third-party cookie blocking
- [ ] **MAUTH-04**: WebSocket connections authenticate user sessions (currently only agent API keys are validated in live-events-ws.ts)
- [ ] **MAUTH-05**: Nested SPA routes (e.g. `/PAC/dashboard`) load correctly on Vercel without 404

### WebSocket

- [ ] **WS-01**: Client detects dead/silent WebSocket connections within 25 seconds and reconnects automatically
- [ ] **WS-02**: Server disables `perMessageDeflate` compression (overhead exceeds benefit for small JSON event payloads)
- [ ] **WS-03**: Client invalidates relevant cache queries after a WebSocket reconnect to recover missed real-time events

## Future Requirements

### Notifications

- **NOTIF-01**: User receives in-app notification when assigned a task
- **NOTIF-02**: User receives email notification for task assignments

### File Storage

- **FILE-01**: File attachments use cloud storage (S3/Supabase Storage) instead of local disk — survive container replacement

## Out of Scope

| Feature | Reason |
|---------|--------|
| Push notifications | Out of scope for v1 — web-first, users check proactively |
| Email notifications | Deferred to future milestone |
| Cloud file storage migration | Deferred — local disk sufficient for current user volume |
| CI/CD pipeline | Manual deploys sufficient for testing phase |

## Traceability

Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| OPTM-01 | — | Pending |
| OPTM-02 | — | Pending |
| OPTM-03 | — | Pending |
| OPTM-04 | — | Pending |
| OPTM-05 | — | Pending |
| CACHE-01 | — | Pending |
| CACHE-02 | — | Pending |
| CACHE-03 | — | Pending |
| CACHE-04 | — | Pending |
| MAUTH-01 | — | Pending |
| MAUTH-02 | — | Pending |
| MAUTH-03 | — | Pending |
| MAUTH-04 | — | Pending |
| MAUTH-05 | — | Pending |
| WS-01 | — | Pending |
| WS-02 | — | Pending |
| WS-03 | — | Pending |

**Coverage:**
- v1.2 requirements: 17 total
- Mapped to phases: 0 (roadmap pending)
- Unmapped: 17 ⚠️

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after initial definition*
