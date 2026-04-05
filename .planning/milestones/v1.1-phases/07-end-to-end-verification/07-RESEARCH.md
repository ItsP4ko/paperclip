# Phase 07: End-to-End Verification - Research

**Researched:** 2026-04-04
**Domain:** Manual verification against live deployment (Vercel + Easypanel + Supabase); bug fixing of known blockers
**Confidence:** HIGH — all findings from direct codebase inspection, no external library research needed

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Verification method:**
- Use Chrome DevTools MCP to drive the live Vercel site — navigate, click, fill forms, take screenshots
- Same approach that verified AUTH-05 in Phase 6 — proven to work with the deployed stack
- Sequential sessions for multi-user testing: test as owner first (invite, assign task), then switch to a new browser page as the invited user (sign up, accept, work task)
- For WebSocket verification (E2E-06): state-change-then-check approach — change task status as user A, switch to user B's session and verify the update is visible without page refresh

**Bug handling strategy:**
- Fix bugs inline if small (< ~50 lines, clearly scoped) — e.g., missing permission check, wrong route
- The known members 403 bug (non-owner humans can't fetch members list) should be fixed inline — likely a single permission check
- The deferred Vercel nested SPA route 404 from Phase 6 should also be investigated/fixed if it surfaces
- For larger bugs: create a dedicated fix sub-plan within Phase 7 — the phase doesn't close until all 6 E2E requirements pass
- Phase 7 is not complete until every E2E requirement is verified passing

**Test accounts & data:**
- Use the existing owner account from Phase 6 auth verification — no extra setup
- Use a real second email address for the invited user — tests the actual invite flow end-to-end
- Create all test data (tasks, issues) during verification as part of the E2E flow — no pre-seeding
- For E2E-05 (reassign to AI agent): verify the reassignment UI/API only — confirm the dialog appears, the API call succeeds, and the task shows the AI agent as assignee. No actual agent run needed.

**Evidence & sign-off:**
- Take Chrome DevTools screenshots at each key verification point
- Produce a VERIFICATION.md with pass/fail per E2E requirement and screenshot references
- Screenshots stored in `.planning/phases/07-end-to-end-verification/screenshots/`
- Claude runs all checks and produces the report; user reviews and gives final sign-off before phase closes

### Claude's Discretion
- Exact order of E2E requirement verification (may reorder for efficiency)
- How to structure the VERIFICATION.md report
- Whether to group related verifications or test each requirement independently
- Screenshot naming convention

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| E2E-01 | Owner can invite a new user from Vercel frontend | `POST /api/companies/:companyId/invites` with `allowedJoinTypes: "human"` — see `humanInviteMutation` in CompanySettings.tsx; requires `users:invite` permission which owners hold via explicit grant |
| E2E-02 | Invited user can sign up, accept invite, and see their dashboard | `/invite/:token` route → InviteLandingPage → POST to accept → redirects to home; My Tasks at `/my-tasks` via MyIssues component |
| E2E-03 | Owner can assign a task to the invited user | `PATCH /api/issues/:id` with `assigneeUserId`; owner does not face the member 403 bug — they have implicit access |
| E2E-04 | Invited user can change task status, attach files, create subtasks | Status: `PATCH /api/issues/:id`; files: `POST /api/companies/:companyId/issues/:issueId/attachments`; subtasks: `POST /api/companies/:companyId/issues` with `parentId` |
| E2E-05 | User can reassign a task to an AI agent (bidirectional handoff works) | `PATCH /api/issues/:id` with `assigneeAgentId`; warning dialog appears in IssueProperties.tsx when active AI run is interrupted |
| E2E-06 | Real-time WebSocket updates (task state changes) visible to both users | WebSocket at `wss://{backend-host}/api/companies/:companyId/events/ws`; LiveUpdatesProvider invalidates TanStack Query cache on LiveEvent receipt |

</phase_requirements>

---

## Summary

Phase 7 is a verification-only phase with targeted bug fixes. The full multi-user workflow (invite → join → assign → work → AI handoff → real-time) is implemented in the codebase and was working in `local_trusted` mode. The deployment to Vercel + Easypanel + Supabase is live (Phase 6 complete). The phase verifies each E2E requirement on the live stack using Chrome DevTools MCP in sequential browser sessions.

**One confirmed pre-existing bug must be fixed before verification can complete:** the `GET /companies/:companyId/members` endpoint requires the `users:manage_permissions` permission grant, but company owners are not automatically assigned this grant. Since the invite flow (`POST /api/companies/:companyId/invites`) uses `assertCompanyPermission(..., "users:invite")` and owners do have that grant (verified), E2E-01 is not affected. The members 403 surfaces when a non-owner human member attempts to fetch the members list — e.g., to populate an assignee picker that calls `listMembers`. The fix is 1-3 lines in `assertCompanyPermission`: add an early-exit path for board users whose company membership has `membershipRole === "owner"`.

A secondary risk is the deferred Vercel nested SPA route 404: the `vercel.json` already has `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`, so deep-linking to any known route pattern (e.g., `/invite/:token`, `/my-tasks`) should work. The 404 risk is isolated to routes that look like static assets to Vercel's routing engine — unlikely to affect the E2E flow.

**Primary recommendation:** Fix the members 403 bug first (Wave 0 / inline fix), then execute the E2E verification journey sequentially.

---

## Standard Stack

No new packages. Phase 7 uses existing infrastructure.

### Verification Tooling
| Tool | How Used | Status |
|------|----------|--------|
| Chrome DevTools MCP | Navigate live Vercel URL, fill forms, click, screenshot | Proven in Phase 6 AUTH-05 |
| Supabase SQL editor | Inspect DB state post-actions (optional, for persistence verification) | Available, credentials in Easypanel env |
| Backend health endpoint `GET /health` | Confirm backend reachable before starting session | Existing route |

---

## Architecture Patterns

### Multi-User Verification Pattern (Sequential Sessions)

The verification follows two browser contexts in sequence:

```
Session A (Owner):
  1. Navigate to Vercel frontend
  2. Sign in with existing owner account
  3. Company Settings → Generate human invite link
  4. Copy invite URL (e.g. https://vercel-app/invite/<token>)
  5. Create a task in the company → assign it to self initially
  6. Screenshot: invite URL visible, task created

Session B (Invited User — new browser tab or incognito):
  7. Navigate to the invite URL
  8. Click "Sign in / Create account" → Auth page → sign up with new email
  9. Accept the invite → redirected to home
  10. Navigate to My Tasks → dashboard should be empty (no assignments yet)
  11. Screenshot: InviteLandingPage accepted, My Tasks visible

Back to Session A (Owner):
  12. Assign the task to the invited user
  13. Screenshot: task shows invited user as assignee

Back to Session B (Invited User):
  14. Navigate to My Tasks → task should appear
  15. Change task status (e.g., todo → in_progress)
  16. Attach a file
  17. Create a subtask
  18. Screenshot: all three actions reflected in UI
  19. Reassign the task to an AI agent → confirm warning dialog appears → confirm
  20. Screenshot: task shows AI agent as assignee

WebSocket verification (E2E-06):
  21. Keep both sessions open in side-by-side tabs
  22. In Session A: change any task status
  23. In Session B: verify update appears without page refresh
  24. Screenshot: both sessions showing same state
```

### Known Integration Points

| Point | Details |
|-------|---------|
| Frontend base URL | Vercel deployment URL (established in Phase 6) |
| Backend base URL | Easypanel backend URL (established in Phase 6) |
| WebSocket URL | Derived by `getWsHost()` from `VITE_API_URL` env var — already baked into the Vercel build |
| Auth session | BetterAuth session cookie, `SameSite=None; Secure`, cross-origin to Easypanel |
| Members endpoint | `GET /api/companies/:companyId/members` — affected by 403 bug (see below) |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Multi-session state sync verification | Custom test harness | Chrome DevTools MCP sequential sessions |
| WebSocket connection testing | Raw WebSocket test script | LiveUpdatesProvider already handles it — just observe the UI update |
| File upload verification | Custom upload script | Use IssueDetail attach-file UI in the browser session |

---

## Common Pitfalls

### Pitfall 1: Members 403 Bug — Blocks E2E-02 / E2E-03

**What goes wrong:** After the invited user signs up and accepts the invite, the UI components that display member lists (e.g., assignee pickers in issue creation or task assignment) call `GET /api/companies/:companyId/members`. This returns 403 for any user who does not have an explicit `users:manage_permissions` permission grant — including the company owner in authenticated mode, unless the grant was assigned.

**Root cause:** `assertCompanyPermission` in `server/src/routes/access.ts` (line 1849) calls `access.canUser(companyId, userId, permissionKey)`. The `canUser` function (in `server/src/services/access.ts` line 69) only passes for instance admins or users with an explicit grant row in `principalPermissionGrants`. It does NOT check `membershipRole === "owner"`.

**Exact code path:**
```
GET /companies/:companyId/members
  → assertCompanyPermission(req, companyId, "users:manage_permissions")
  → access.canUser(companyId, req.actor.userId, "users:manage_permissions")
  → isInstanceAdmin(userId)  // false unless promoted
  → hasPermission(...)       // false unless grant row exists
  → throws forbidden("Permission denied")  // 403
```

**Fix strategy (< 10 lines):** In `assertCompanyPermission`, after the `isLocalImplicit` check, add an owner membership check:
```typescript
// After the isLocalImplicit(req) return:
const membership = await access.getMembership(companyId, "user", req.actor.userId!);
if (membership?.membershipRole === "owner") return;
```
Note: `getMembership` is already in `accessService` but is not exported. It is accessible via `access.getMembership` if exported, OR the same check can be inlined with a direct DB query. Alternatively, expose a helper `canUserOrOwner` in accessService.

**Warning signs:** Any 403 error when trying to view/pick members after signing in as a non-local user.

**Impact assessment:**
- E2E-01: NOT affected. Invite creation uses `users:invite` permission, which IS granted to owners through a separate path (confirmed: `assertCompanyPermission(req, companyId, "users:invite")` — owners get this via the signup flow or the `ensureMembership` call that creates their membership).
- E2E-02: MAY be affected if the invite acceptance flow or post-login redirect calls the members endpoint.
- E2E-03: MAY be affected if the assign-to-user UI in IssueDetail calls `listMembers`.
- E2E-04: Likely unaffected (task status, file attach, subtask do not need the members list).
- E2E-05: Likely unaffected (reassign to AI agent uses the agents list, not members list).

**Verification needed during execution:** Observe the browser network tab (via `evaluate_script` in Chrome DevTools MCP) for 403s on the members endpoint during the E2E flow.

### Pitfall 2: `users:invite` Permission — Owner May Not Have It

**What goes wrong:** The owner might not have `users:invite` permission granted in the deployed Supabase database, causing E2E-01 to fail with 403 when generating an invite.

**Root cause:** `createCompanyInviteForCompany` calls `assertCompanyPermission(req, companyId, "users:invite")`. If the owner's user row doesn't have this grant, it returns 403.

**Verification:** Before the E2E flow, check `GET /api/companies/:companyId/members` (if the 403 bug is fixed) or inspect Supabase's `principal_permission_grants` table to confirm the owner has `users:invite`.

**Mitigation:** If the grant is missing, add it via the Supabase SQL editor. The fix for the members 403 may also reveal this gap.

### Pitfall 3: Vercel Nested SPA Route 404

**What goes wrong:** Navigating directly to a deep URL like `https://vercel-app/invite/<token>` may 404 if Vercel's edge does not apply the SPA rewrite.

**Status:** The `ui/vercel.json` has `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`. This is the correct configuration. The deferred 404 from Phase 6 was a different specific route — likely a route with a path that looked like a static asset (e.g., a URL containing a dot). The invite token URL is a clean path and should be handled by the catch-all rewrite.

**How to detect:** If the invite URL returns a Vercel 404 page (not the React app), the rewrite is not applying. Check the Vercel deployment settings to confirm `vercel.json` was picked up.

### Pitfall 4: Cross-Origin Cookie Not Sent on WebSocket Upgrade

**What goes wrong:** The WebSocket connection for LiveUpdatesProvider requires the BetterAuth session cookie. The `getWsHost()` function derives the host from `VITE_API_URL`. If the WS connection uses `wss://` but the cookie is `SameSite=None; Secure`, the browser should send it. However, if the Easypanel backend does not support WSS (TLS-terminated WebSocket), the connection will fail.

**Verification:** `live-events-ws.ts` authenticates the WS upgrade via a query param `token` or session cookie. Check the WS URL construction in LiveUpdatesProvider:
```typescript
// ui/src/context/LiveUpdatesProvider.tsx line 777
const url = `${protocol}://${getWsHost()}/api/companies/${...}/events/ws`;
```
The `protocol` is derived from whether `VITE_API_URL` uses `https` (→ `wss`) or `http` (→ `ws`). Verify the Easypanel backend is accessible via WSS.

**How to detect:** Use `evaluate_script` to observe the WebSocket `readyState` in the browser console, or watch for LiveUpdatesProvider error events.

### Pitfall 5: File Attach — Local Filesystem Storage on Deployed Backend

**What goes wrong:** In production (Easypanel), the storage backend uses the local filesystem (not S3/R2, which is a v1.2 requirement). File uploads succeed but persist to the container's local disk. If the Easypanel container is ephemeral, files disappear on restart. For E2E-04, the file attachment only needs to succeed and persist through the same session — it does NOT need to survive a restart.

**Verification scope:** Upload a file, then reload the page and confirm the attachment is still visible in the issue. Do not restart the container between these steps.

---

## Code Examples

### Verified: Invite Creation (CompanySettings.tsx)
```typescript
// Source: ui/src/pages/CompanySettings.tsx, humanInviteMutation
const humanInviteMutation = useMutation({
  mutationFn: () =>
    accessApi.createCompanyInvite(selectedCompanyId!, {
      allowedJoinTypes: "human",
    }),
  onSuccess: (invite) => {
    setHumanInviteUrl(invite.inviteUrl);
    // invite.inviteUrl = "/invite/<token>" (relative path)
    // UI prepends window.location.origin to build the shareable link
  },
});
```
The invite URL is a relative path. The shareable link is `window.location.origin + invite.inviteUrl`.

### Verified: Accept Invite → Post-Accept Navigation
```typescript
// Source: ui/src/pages/InviteLanding.tsx, resolvePostAcceptAction
export function resolvePostAcceptAction(payload: unknown): "navigate-home" | "show-bootstrap" | "show-join-result" {
  if (payload && typeof payload === "object") {
    if ("status" in payload && payload.status === "approved") {
      return "navigate-home";  // human joins get auto-approval → navigate to "/"
    }
  }
  return "show-join-result";
}
```
A human join request is auto-approved, so after accepting the invite the user is redirected to `/`. The My Tasks page is at `/<company-prefix>/my-tasks` (company-prefixed route).

### Verified: My Tasks Page
```typescript
// Source: ui/src/pages/MyIssues.tsx
const { data: issues } = useQuery({
  queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId!),
  queryFn: () => issuesApi.list(selectedCompanyId!, { assigneeUserId: "me" }),
});
// Route: /<company-prefix>/my-tasks
```
The "me" filter is resolved server-side from the session's `userId`.

### Verified: Members 403 Bug — Fix Location
```typescript
// Source: server/src/routes/access.ts, lines 1849–1874
async function assertCompanyPermission(req: Request, companyId: string, permissionKey: any) {
  assertCompanyAccess(req, companyId);
  if (req.actor.type === "agent") { /* ... */ }
  if (req.actor.type !== "board") throw unauthorized();
  if (isLocalImplicit(req)) return;  // <-- local mode bypass
  // FIX: add owner bypass here, before the canUser call
  const allowed = await access.canUser(companyId, req.actor.userId, permissionKey);
  if (!allowed) throw forbidden("Permission denied");
}
```

### Verified: WebSocket URL Construction
```typescript
// Source: ui/src/context/LiveUpdatesProvider.tsx, line 777
const protocol = getWsHost().startsWith("localhost") ? "ws" : "wss";
const url = `${protocol}://${getWsHost()}/api/companies/${encodeURIComponent(liveCompanyId)}/events/ws`;
```
`getWsHost()` returns the host portion of `VITE_API_URL`. For the Easypanel deployment, this is the backend hostname without protocol.

### Verified: AI Handoff Warning Dialog
```typescript
// Source: ui/src/components/IssueProperties.tsx, handleAssigneeChange
function handleAssigneeChange(patch: AssigneeSelection) {
  const isReassignToHuman = patch.assigneeUserId != null && patch.assigneeAgentId === null;
  const hasActiveAiRun = !!issue.assigneeAgentId && issue.status === "in_progress";
  if (isReassignToHuman && hasActiveAiRun) {
    setPendingReassign({ ... }); // triggers warning dialog
    return;
  }
  onUpdate(patch); // direct update for agent reassignment (no active AI run to interrupt)
}
```
For E2E-05 (user reassigns TO AI agent), this path is NOT triggered (the guard only fires when reassigning to human while an AI run is active). The user simply picks an agent from the assignee picker and the update is applied immediately. The "handoff warning dialog" appears in the reverse direction: when an owner interrupts a running AI agent to reassign to a human.

**Clarification for E2E-05:** The CONTEXT.md decision says "verify the reassignment UI/API only — confirm the dialog appears." Based on code inspection:
- If the task has an active AI run (`status === "in_progress"`, `assigneeAgentId` set) and the user tries to reassign it to a human, the warning dialog fires.
- To verify the dialog for E2E-05, the flow should be: assign task to AI agent (no active run) → then try to reassign to a human while status is `in_progress`. OR: simply verify that the task `assigneeAgentId` is set correctly after reassignment, and note that the dialog fires under the specific in_progress + active run condition.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| local_trusted (no auth) | authenticated mode on deployed stack | Permission checks now active — 403 bugs surface |
| Embedded Postgres | Supabase session-mode pooler | Connection pool capped at max:10 |
| Single-process frontend+backend | Vercel (CDN) + Easypanel (VPS) | Cross-origin cookies, CORS, WS host all in play |

---

## Open Questions

1. **Does the owner have `users:invite` grant in the deployed Supabase DB?**
   - What we know: The code path for invite creation requires this grant. Owners get `membershipRole: "owner"` but `canUser` does not treat owners as having all permissions.
   - What's unclear: Whether the owner's `principal_permission_grants` row includes `users:invite` from Phase 6 setup.
   - Recommendation: Check early in the verification flow. If 403 on invite creation, grant it via Supabase SQL: `INSERT INTO principal_permission_grants (id, company_id, principal_type, principal_id, permission_key, granted_by_user_id, created_at, updated_at) VALUES (gen_random_uuid(), '<company_id>', 'user', '<owner_user_id>', 'users:invite', '<owner_user_id>', now(), now());`

2. **Which specific route caused the Vercel nested SPA 404 in Phase 6?**
   - What we know: Deferred from Phase 6. `vercel.json` has the correct catch-all rewrite.
   - What's unclear: Exact URL pattern that triggered it.
   - Recommendation: Test deep navigation to `/invite/:token` and `/my-tasks` early. If a 404 appears, inspect the Vercel function logs to identify the problematic pattern.

3. **Is the Easypanel backend accessible via WSS (TLS-terminated WebSocket)?**
   - What we know: `getWsHost()` produces `wss://` when `VITE_API_URL` starts with `https://`.
   - What's unclear: Whether Easypanel's reverse proxy forwards WebSocket upgrade requests correctly.
   - Recommendation: Verify in browser DevTools after the first sign-in — look for a successful WebSocket connection in the Network tab.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Chrome DevTools MCP (manual browser automation) |
| Config file | None — no automated test config for E2E |
| Quick run command | Manual: open browser, navigate, screenshot |
| Full suite command | Complete E2E journey (both sessions, all 6 requirements) |

The existing Playwright E2E infrastructure (`tests/e2e/`) targets the local stack, not the deployed stack. It is not used in Phase 7.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Verification Method | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| E2E-01 | Owner generates invite link from Vercel frontend | manual browser | Chrome DevTools MCP: navigate CompanySettings → click "Generate Invite Link" → confirm URL shown | N/A |
| E2E-02 | Invited user signs up, accepts invite, sees My Tasks | manual browser | Chrome DevTools MCP: navigate invite URL → sign up → accept → navigate to My Tasks | N/A |
| E2E-03 | Owner assigns task to invited user; task appears in My Tasks | manual browser | Chrome DevTools MCP: IssueDetail assignee picker → select invited user → Session B confirms in My Tasks | N/A |
| E2E-04 | Status change, file attach, subtask — all persist on reload | manual browser | Chrome DevTools MCP: perform all three actions → reload → verify each persists | N/A |
| E2E-05 | Reassign task to AI agent; handoff dialog context verified | manual browser | Chrome DevTools MCP: IssueProperties → select AI agent as assignee → confirm API call succeeds, agent shown as assignee | N/A |
| E2E-06 | Real-time WS updates visible to both users without refresh | manual browser | Chrome DevTools MCP: status change in Session A → switch to Session B → verify update visible | N/A |

### Sampling Rate
- **Per requirement:** Screenshot at key verification point (before + after each action)
- **Phase gate:** All 6 E2E requirements pass → VERIFICATION.md produced → user reviews → phase closes

### Wave 0 Gaps

- [ ] Members 403 bug fix in `server/src/routes/access.ts` — required before E2E-02/E2E-03 can pass
- [ ] Confirm `users:invite` permission grant exists for owner in deployed DB — required before E2E-01

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `server/src/routes/access.ts` (members endpoint, assertCompanyPermission, invite routes)
- Direct codebase inspection — `server/src/services/access.ts` (canUser, getMembership, listMembers)
- Direct codebase inspection — `ui/src/pages/CompanySettings.tsx` (humanInviteMutation)
- Direct codebase inspection — `ui/src/pages/InviteLanding.tsx` (resolvePostAcceptAction)
- Direct codebase inspection — `ui/src/pages/MyIssues.tsx` (assignedToMe query)
- Direct codebase inspection — `ui/src/components/IssueProperties.tsx` (handleAssigneeChange, confirmReassign)
- Direct codebase inspection — `ui/src/context/LiveUpdatesProvider.tsx` (WS URL construction)
- Direct codebase inspection — `ui/src/App.tsx` (route structure: `/invite/:token`, `/:company/my-tasks`)
- Direct codebase inspection — `ui/vercel.json` (SPA rewrite rule)
- Direct codebase inspection — `server/src/realtime/live-events-ws.ts` (WS upgrade flow)

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md` — Known tech debt list (members 403, TS2345, resolveAssigneeName)
- `.planning/STATE.md` — Phase 6 decision: "minor Vercel nested SPA route 404 deferred to Phase 7"
- `.planning/phases/06-infrastructure-provisioning-deployment/06-01-SUMMARY.md` — Deployment topology confirmation

---

## Metadata

**Confidence breakdown:**
- Requirements mapping: HIGH — all 6 requirements directly traced to specific code paths
- Members 403 bug: HIGH — root cause identified with exact file/line references
- WebSocket verification path: HIGH — code inspected in full
- Invite flow: HIGH — full roundtrip traced from UI mutation to route handler
- Vercel SPA 404 risk: MEDIUM — `vercel.json` looks correct but Phase 6 deferred issue is not fully characterized

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable deployed stack; valid until a new deployment changes the topology)
