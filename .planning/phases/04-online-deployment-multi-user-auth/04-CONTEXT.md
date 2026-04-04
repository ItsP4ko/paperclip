# Phase 4: Online Deployment & Multi-User Auth - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable internet hosting — switch from `local_trusted` to `authenticated` mode so any user can open an invite link, auto-create an account, and enter the app immediately without manual approval. Existing `local_trusted` mode must remain unchanged.

</domain>

<decisions>
## Implementation Decisions

### Auto-approval

- ALL human invite joins auto-approve — no exceptions, no mode-gating
- Mechanism: inline approval in the same transaction as invite accept (create joinRequest → immediately approve → create membership atomically)
- Server returns the joinRequest with `status='approved'` + `companyId` the user joined
- Agent joins are unaffected — they still use `pending_approval` flow

### Post-join landing

- When `status='approved'` is returned, **skip the success card entirely** — navigate immediately
- Navigate to `/` (root), which already redirects to the user's company context via existing routing
- No intermediate confirmation screen for auto-approved humans

### Invite→auth UX flow

- Existing `AuthPage` at `/auth` is used as-is — no invite-specific context needed on auth screen
- Flow: invite → if unauthenticated → redirect to `/auth?next=/invite/TOKEN` → create account → redirect back → auto-join → navigate to `/`
- Button copy changes from "Submit join request" to **"Join [Company Name]"** (uses `companyName` from invite; falls back to "Join" if no company name)

### Deployment configuration

- `PAPERCLIP_DEPLOYMENT_MODE=authenticated` env var is sufficient — no additional config required
- `BETTER_AUTH_SECRET` is also required (already documented in docker-compose.quickstart.yml)
- No new config file sections or base URL requirements for Phase 4 MVP

### Out of scope (explicit)

- The `// TODO: replace with real auth` comment in `server/src/routes/issues.ts` is intentionally left — per roadmap, this is flagged for future iteration, not Phase 4
- No changes to `local_trusted` mode behavior

### Claude's Discretion

- Exact transaction boundary (whether to use a separate DB call or extend the existing insert transaction)
- Error handling if auto-approval fails mid-transaction
- Query invalidation strategy after successful join (which queryClient keys to invalidate)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements are fully captured in decisions above.

### Key files to read before implementing

- `server/src/routes/access.ts` — invite accept handler (lines ~2147–2500); joinRequest creation with `status: "pending_approval"` at line ~2335
- `server/src/middleware/auth.ts` — actorMiddleware; how `local_trusted` vs `authenticated` mode affects req.actor
- `server/src/auth/better-auth.ts` — BetterAuth instance creation; `authDisableSignUp` config
- `ui/src/pages/InviteLanding.tsx` — full invite acceptance UI; `requiresAuthForHuman` logic; success state rendering
- `ui/src/pages/Auth.tsx` — existing sign-in/sign-up page
- `server/src/config.ts` — `deploymentMode` config (line ~135); `authDisableSignUp` (line ~169)
- `docker/docker-compose.quickstart.yml` — reference deployment config with `PAPERCLIP_DEPLOYMENT_MODE: "authenticated"`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `authApi.getSession()` / `authApi.signInEmail()` / `authApi.signUpEmail()` — already implemented in `ui/src/api/auth.ts`
- `accessApi.acceptInvite()` — already calls the invite accept endpoint; just needs to handle `status='approved'` response
- `useNavigate()` — already used in InviteLanding for other navigation flows
- `queryKeys.auth.session` / `queryKeys.companies.all` — invalidation keys already used in AuthPage post-auth

### Established Patterns

- `db.transaction()` — used throughout `access.ts` for atomic operations (e.g., mark invite accepted + insert joinRequest)
- `req.actor.type === "board" && req.actor.userId` — guard pattern for authenticated human actors
- `isLocalImplicit(req)` — helper to detect `local_trusted` bypass (leave unchanged)

### Integration Points

- `server/src/routes/access.ts` POST `/invites/:token/accept` — this is where auto-approval logic goes (after joinRequest insert, immediately run the existing approval flow)
- `ui/src/pages/InviteLanding.tsx` `acceptMutation.onSuccess` — this is where navigation-on-approval goes (check `payload.joinRequestStatus === 'approved'` and navigate to `/`)

</code_context>

<specifics>
## Specific Ideas

- The existing approval flow already exists at `POST /companies/:id/join-requests/:requestId/approve` — look at that handler for the membership creation logic to reuse inline
- `companyName` is already loaded from `inviteQuery.data?.companyName` in InviteLanding — use it directly for the button label

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-online-deployment-multi-user-auth*
*Context gathered: 2026-04-04*
