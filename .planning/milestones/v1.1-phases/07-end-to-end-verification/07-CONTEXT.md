# Phase 7: End-to-End Verification - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate the full multi-user workflow (owner invites, user joins, task assigned, task worked, handoff to AI agent, real-time updates) on the live deployment (Vercel frontend + Easypanel backend + Supabase PG). This is a verification phase — no new features, but small bug fixes are in scope when they block a requirement.

</domain>

<decisions>
## Implementation Decisions

### Verification method
- Use Chrome DevTools MCP to drive the live Vercel site — navigate, click, fill forms, take screenshots
- Same approach that verified AUTH-05 in Phase 6 — proven to work with the deployed stack
- Sequential sessions for multi-user testing: test as owner first (invite, assign task), then switch to a new browser page as the invited user (sign up, accept, work task)
- For WebSocket verification (E2E-06): state-change-then-check approach — change task status as user A, switch to user B's session and verify the update is visible without page refresh

### Bug handling strategy
- Fix bugs inline if small (< ~50 lines, clearly scoped) — e.g., missing permission grant, wrong route
- The known members 403 bug (non-owner humans can't fetch members list) should be fixed inline — likely a single permission check
- The deferred Vercel nested SPA route 404 from Phase 6 should also be investigated/fixed if it surfaces
- For larger bugs: create a dedicated fix sub-plan within Phase 7 — the phase doesn't close until all 6 E2E requirements pass
- Phase 7 is not complete until every E2E requirement is verified passing

### Test accounts & data
- Use the existing owner account from Phase 6 auth verification — no extra setup
- Use a real second email address for the invited user — tests the actual invite flow end-to-end
- Create all test data (tasks, issues) during verification as part of the E2E flow — no pre-seeding
- For E2E-05 (reassign to AI agent): verify the reassignment UI/API only — confirm the dialog appears, the API call succeeds, and the task shows the AI agent as assignee. No actual agent run needed.

### Evidence & sign-off
- Take Chrome DevTools screenshots at each key verification point
- Produce a VERIFICATION.md with pass/fail per E2E requirement and screenshot references
- Screenshots stored in `.planning/phases/07-end-to-end-verification/screenshots/`
- Claude runs all checks and produces the report; user reviews and gives final sign-off before phase closes

### Claude's Discretion
- Exact order of E2E requirement verification (may reorder for efficiency)
- How to structure the VERIFICATION.md report
- Whether to group related verifications or test each requirement independently
- Screenshot naming convention

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### E2E Requirements
- `.planning/REQUIREMENTS.md` — Requirements E2E-01 through E2E-06 define the exact verification criteria
- `.planning/ROADMAP.md` — Phase 7 success criteria (6 concrete checks matching E2E requirements)

### Deployment architecture
- `.planning/phases/05-cross-origin-code-preparation/05-CONTEXT.md` — Cross-origin decisions: VITE_API_URL, CORS, cookie config, WebSocket URL derivation
- `.planning/phases/06-infrastructure-provisioning-deployment/06-01-SUMMARY.md` — Infrastructure deployment summary (Easypanel + Supabase + Vercel topology)

### Known issues to investigate
- `.planning/PROJECT.md` — Known tech debt section: members 403, TS2345 error, resolveAssigneeName unused
- `.planning/STATE.md` — Phase 6 decision: "minor Vercel nested SPA route 404 deferred to Phase 7"

### Codebase architecture
- `.planning/codebase/ARCHITECTURE.md` — System architecture, data flow, entry points
- `.planning/codebase/TESTING.md` — Existing test infrastructure (Playwright E2E config, Vitest patterns)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Chrome DevTools MCP tools: `take_screenshot`, `navigate_page`, `click`, `fill`, `fill_form`, `evaluate_script` — all used successfully in Phase 6 AUTH-05 verification
- Playwright E2E infrastructure: `tests/e2e/playwright.config.ts` with Chromium config — could be adapted for future automated regression
- `ui/src/api/client.ts`: Central API client with `credentials: "include"` — cross-origin requests already configured

### Established Patterns
- Phase 6 used Chrome DevTools MCP to verify auth flow: navigate to Vercel URL, fill sign-up form, check session cookie persistence — same pattern applies here
- WebSocket connections derive from `VITE_API_URL` via `getWsHost()` in `ui/src/api/api-base.ts`
- Actor resolution in `server/src/middleware/auth.ts` — key to understanding the members 403 bug

### Integration Points
- Live Vercel frontend URL — entry point for all E2E verification
- Easypanel backend health endpoint: `GET /health`
- Supabase PostgreSQL — data persistence verification (task changes survive page refresh)
- WebSocket server in `server/src/realtime/live-events-ws.ts` — real-time update verification

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The verification should follow the natural user journey: owner invites → user joins → owner assigns task → user works task → user hands off to AI → real-time updates observed.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-end-to-end-verification*
*Context gathered: 2026-04-04*
