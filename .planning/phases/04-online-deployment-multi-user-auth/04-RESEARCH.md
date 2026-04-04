# Phase 4: Online Deployment & Multi-User Auth - Research

**Researched:** 2026-04-04
**Domain:** BetterAuth invite flow, Drizzle transactions, React Query navigation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auto-approval**
- ALL human invite joins auto-approve — no exceptions, no mode-gating
- Mechanism: inline approval in the same transaction as invite accept (create joinRequest → immediately approve → create membership atomically)
- Server returns the joinRequest with `status='approved'` + `companyId` the user joined
- Agent joins are unaffected — they still use `pending_approval` flow

**Post-join landing**
- When `status='approved'` is returned, skip the success card entirely — navigate immediately
- Navigate to `/` (root), which already redirects to the user's company context via existing routing
- No intermediate confirmation screen for auto-approved humans

**Invite→auth UX flow**
- Existing `AuthPage` at `/auth` is used as-is — no invite-specific context needed on auth screen
- Flow: invite → if unauthenticated → redirect to `/auth?next=/invite/TOKEN` → create account → redirect back → auto-join → navigate to `/`
- Button copy changes from "Submit join request" to **"Join [Company Name]"** (uses `companyName` from invite; falls back to "Join" if no company name)

**Deployment configuration**
- `PAPERCLIP_DEPLOYMENT_MODE=authenticated` env var is sufficient — no additional config required
- `BETTER_AUTH_SECRET` is also required (already documented in docker-compose.quickstart.yml)
- No new config file sections or base URL requirements for Phase 4 MVP

**Out of scope (explicit)**
- The `// TODO: replace with real auth` comment in `server/src/routes/issues.ts` is intentionally left
- No changes to `local_trusted` mode behavior

### Claude's Discretion
- Exact transaction boundary (whether to use a separate DB call or extend the existing insert transaction)
- Error handling if auto-approval fails mid-transaction
- Query invalidation strategy after successful join (which queryClient keys to invalidate)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Any user can open an invite link, auto-create account, and enter the app immediately (no approval step) | Full flow traced: `requiresAuthForHuman` redirect → AuthPage → back to invite → acceptInvite → auto-approve inline → navigate `/` |
| AUTH-02 | Server runs in `authenticated` mode with BetterAuth enabled | Config already exists at `config.ts:140` — `PAPERCLIP_DEPLOYMENT_MODE=authenticated` activates BetterAuth session resolution in `actorMiddleware` |
| AUTH-03 | Existing `local_trusted` mode still works unchanged | `isLocalImplicit()` guard at `access.ts:1377` and `actorMiddleware` default at `auth.ts:25-27` — no changes required to these paths |
</phase_requirements>

## Summary

Phase 4 is a targeted surgical change across two files: one server route handler and one UI page. The backend already has all infrastructure — BetterAuth sessions, `db.transaction()`, `access.ensureMembership()`, `access.setPrincipalGrants()`, and the full membership creation logic in the existing approve handler. The only missing piece is calling that logic inline within the `POST /invites/:token/accept` handler after creating the joinRequest for human requestors.

The frontend change is equally bounded: InviteLanding.tsx already handles `requiresAuthForHuman` redirect, has `acceptMutation.onSuccess`, and has `companyName` in scope. The changes are: update button label copy, and in `onSuccess` check `payload.status === 'approved'` to navigate directly to `/` instead of showing the join-request success card.

Deployment configuration is already handled by the existing `docker-compose.quickstart.yml` — no new env vars or config sections are needed.

**Primary recommendation:** Inline the human membership creation directly inside the existing `db.transaction()` in the invite accept handler, immediately after the joinRequest insert. Return the joinRequest row with `status: 'approved'`. On the UI, check `payload.status === 'approved'` in `onSuccess` and call `navigate('/')`.

## Standard Stack

### Core (already in use — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | in use | Session auth for authenticated mode | Already wired in `server/src/auth/better-auth.ts` |
| drizzle-orm | in use | DB transactions, ORM queries | All existing transactions use `db.transaction()` pattern |
| @tanstack/react-query | in use | Mutation + query invalidation | `acceptMutation`, `queryClient.invalidateQueries` already used |
| react-router (via `@/lib/router`) | in use | Post-join navigation | `useNavigate()` already used in InviteLanding |

**No new packages required.** This phase adds no new dependencies.

### Alternatives Considered
None — all tooling is already present and in active use.

## Architecture Patterns

### Recommended Project Structure

No new files or folders. Changes are confined to:

```
server/src/routes/
└── access.ts              # POST /invites/:token/accept — inline auto-approval for human joins

ui/src/pages/
└── InviteLanding.tsx      # onSuccess navigation + button copy change
```

### Pattern 1: Inline approval within the invite-accept transaction

**What:** After inserting the joinRequest row (currently `status: 'pending_approval'`), when `requestType === 'human'`, immediately call `access.ensureMembership()` and `access.setPrincipalGrants()` within the same `db.transaction()`, then update the joinRequest row to `status: 'approved'`.

**When to use:** Human requestors only. Agent joins keep the existing `pending_approval` path unchanged.

**Key reference — existing approve handler (access.ts:2626-2715):**
```typescript
// Human approval logic to reuse inline:
if (existing.requestType === "human") {
  if (!existing.requestingUserId)
    throw conflict("Join request missing user identity");
  await access.ensureMembership(companyId, "user", existing.requestingUserId, "member", "active");
  const grants = grantsFromDefaults(invite.defaultsPayload as Record<string, unknown> | null, "human");
  await access.setPrincipalGrants(companyId, "user", existing.requestingUserId, grants, req.actor.userId ?? null);
}
// Then update joinRequest status to 'approved'
```

**Transaction boundary decision (Claude's discretion):** Extend the existing `db.transaction()` block (lines ~2317-2357) to also call `ensureMembership`, `setPrincipalGrants`, and a final `UPDATE joinRequests SET status='approved'` atomically. This is simpler and safer than a second transaction — if membership creation fails, the joinRequest insert rolls back and the invite remains unused.

### Pattern 2: UI navigation on approved status

**What:** In `acceptMutation.onSuccess`, check if the returned payload has `status === 'approved'`. If so, call `navigate('/')` immediately. If not (agent join, pending), fall through to existing result-display logic.

**Current flow (already in InviteLanding.tsx:107-117):**
```typescript
onSuccess: async (payload) => {
  setError(null);
  await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
  await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  const asBootstrap = payload && typeof payload === "object" && "bootstrapAccepted" in payload;
  setResult({ kind: asBootstrap ? "bootstrap" : "join", payload });
},
```

**After change:** Add a check before `setResult`:
```typescript
const asJoinRequest = payload && typeof payload === "object" && "status" in payload;
if (asJoinRequest && (payload as JoinRequest).status === "approved") {
  navigate("/");
  return;
}
```

### Pattern 3: Button label from companyName

**What:** Replace static `"Submit join request"` button label with `"Join [companyName]"` for human joins.

**Source of companyName:** Already loaded at `InviteLanding.tsx:72`:
```typescript
const companyName = invite?.companyName?.trim() || null;
```

**Button copy logic:**
```typescript
joinType === "human"
  ? companyName ? `Join ${companyName}` : "Join"
  : "Submit join request"   // agent joins keep current copy
```

Note: bootstrap invite button copy remains `"Accept bootstrap invite"`.

### Anti-Patterns to Avoid

- **Separate transaction for approval:** Don't create the joinRequest in one transaction, then approve in a second. A failure between transactions leaves an orphaned `pending_approval` human joinRequest with no auto-resolution path.
- **Mode-gating auto-approval:** The decision is mode-agnostic — ALL human invite joins auto-approve regardless of `deploymentMode`. Do not add an `if (deploymentMode === 'authenticated')` guard.
- **Showing the pending card for humans:** The existing `result?.kind === "join"` branch renders a "request pending approval" card. Human joins must skip this entirely via the `navigate('/')` check in `onSuccess`.
- **Changing requiresAuthForHuman logic:** This redirect guard is already correct and must stay unchanged — it already redirects to `/auth?next=/invite/TOKEN` when in authenticated mode and not signed in.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Membership creation | Custom INSERT into companyMemberships | `access.ensureMembership()` | Handles idempotency, correct schema fields, active status |
| Permission grants | Manual grant table writes | `access.setPrincipalGrants()` | Applies correct default human grants from invite.defaultsPayload |
| Session resolution | Custom cookie parsing | `resolveBetterAuthSession()` already wired in actorMiddleware | Already handles the session→userId translation |
| Post-auth redirect | Custom state tracking | `?next=` query param already supported by AuthPage | `nextPath = searchParams.get("next") || "/"` is already in Auth.tsx:22 |

**Key insight:** Every building block is already in the codebase. This phase is assembly, not construction.

## Common Pitfalls

### Pitfall 1: requestingUserId is null in authenticated mode
**What goes wrong:** `joinRequest.requestingUserId` is populated from `req.actor.userId`. In `local_trusted` mode, `userId` is `"local-board"`. In `authenticated` mode, if the session is not resolved (e.g. BetterAuth headers missing), `req.actor` is `{ type: 'none' }` — causing the human invite accept guard at access.ts:2212-2223 to throw 401 before the transaction.
**Why it happens:** `requiresAuthForHuman` in the UI prevents the button from being clicked without a session, but only when `healthQuery.data?.deploymentMode === 'authenticated'`. If health endpoint fails to load, the button could become enabled while unauthenticated.
**How to avoid:** The server-side guard at access.ts:2212 already throws 401 for unauthenticated humans — no additional protection needed. Trust the server guard.
**Warning signs:** 401 response from `/invites/:token/accept` with `requestType: "human"`.

### Pitfall 2: Auto-approval sets status but invite is already marked acceptedAt
**What goes wrong:** The `update invites SET acceptedAt` and the `insert joinRequests` are inside the same transaction. If auto-approval (ensureMembership + setPrincipalGrants + update joinRequests SET status='approved') fails after the insert, the transaction rolls back — the invite `acceptedAt` is not set either. The user can retry. This is correct behavior.
**Why it happens:** All five operations (mark invite accepted, insert joinRequest, ensureMembership, setPrincipalGrants, update joinRequest to approved) must be one atomic unit.
**How to avoid:** Keep all operations inside the single `db.transaction()` block.

### Pitfall 3: approvedByUserId attribution
**What goes wrong:** The existing approve handler sets `approvedByUserId: req.actor.userId`. For inline auto-approval, there is no human approver — the system is self-approving. Using `req.actor.userId` (the joining user themselves) as `approvedByUserId` is technically inaccurate but acceptable for v1.
**How to avoid:** Set `approvedByUserId` to `req.actor.userId` (same as the requester) — consistent with the existing pattern where `isLocalImplicit` falls back to `"local-board"`. Alternatively, leave it null to indicate system auto-approval. Either is correct; the planner should choose one and be consistent with the activity log.

### Pitfall 4: Query invalidation order matters
**What goes wrong:** Navigating to `/` before `queryClient.invalidateQueries({ queryKey: queryKeys.companies.all })` completes means the root route may not yet know about the new membership — causing a redirect loop or empty state.
**How to avoid:** Await both invalidations before calling `navigate('/')`, exactly as AuthPage already does in its `onSuccess` (Auth.tsx:47-51).

### Pitfall 5: authDisableSignUp must be false for invite flow to work
**What goes wrong:** `config.authDisableSignUp` defaults to `false`, but if an operator sets `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true`, new users cannot create accounts, breaking the invite-to-account-creation flow.
**Why it happens:** This is a separate config from `deploymentMode`. The invite flow requires sign-up enabled.
**How to avoid:** This is an operator concern, not a code concern. Document in the docker-compose reference that `PAPERCLIP_AUTH_DISABLE_SIGN_UP` must not be set to `true` when invite-based onboarding is expected.

## Code Examples

Verified patterns from existing codebase:

### Existing transaction block to extend (access.ts:2316-2357)
```typescript
// Source: server/src/routes/access.ts (line ~2316)
const created = !inviteAlreadyAccepted
  ? await db.transaction(async (tx) => {
      await tx.update(invites).set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt), isNull(invites.revokedAt)));

      const row = await tx.insert(joinRequests).values({
        // ...
        status: "pending_approval",   // <-- change to 'approved' inline for humans
        // ...
      }).returning().then((rows) => rows[0]);

      // ADD HERE for human requests:
      // access.ensureMembership(companyId, "user", userId, "member", "active")
      // access.setPrincipalGrants(companyId, "user", userId, grants, null)
      // tx.update(joinRequests).set({ status: "approved", approvedAt: new Date() })...

      return row;
    })
  : /* replay path, unchanged */
```

### Membership + grants pattern (access.ts:2626-2646)
```typescript
// Source: server/src/routes/access.ts (line ~2626) — the existing approve handler
await access.ensureMembership(companyId, "user", existing.requestingUserId, "member", "active");
const grants = grantsFromDefaults(
  invite.defaultsPayload as Record<string, unknown> | null,
  "human"
);
await access.setPrincipalGrants(
  companyId,
  "user",
  existing.requestingUserId,
  grants,
  req.actor.userId ?? null
);
```

### UI navigation pattern (Auth.tsx:47-51)
```typescript
// Source: ui/src/pages/Auth.tsx (line ~47)
onSuccess: async () => {
  await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
  await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  navigate(nextPath, { replace: true });
},
```

### requiresAuthForHuman redirect (InviteLanding.tsx:86-89, 299-308)
```typescript
// Source: ui/src/pages/InviteLanding.tsx (line ~86) — already correct, no change needed
const requiresAuthForHuman =
  joinType === "human" &&
  healthQuery.data?.deploymentMode === "authenticated" &&
  !sessionQuery.data;

// Already renders: <Link to={`/auth?next=${encodeURIComponent(`/invite/${token}`)}`}>
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Manual admin approval for every human join | Inline auto-approval in same transaction | Users enter immediately, no wait |
| `pending_approval` status for human joins | `approved` status returned directly | UI skips success card, navigates to app |

**Nothing deprecated in this phase.** All existing patterns (agent approval flow, local_trusted bypass, BetterAuth session handling) remain unchanged.

## Open Questions

1. **approvedByUserId for auto-approved joins**
   - What we know: The column exists and is set to the approving admin's userId in the manual flow.
   - What's unclear: Should it be `req.actor.userId` (the joiner themselves), `null`, or a sentinel like `"system"`?
   - Recommendation: Use `req.actor.userId` — it's non-null for authenticated human joins and avoids a schema assumption. Acceptable for v1.

2. **Activity log action for auto-approval**
   - What we know: The existing approve handler logs `"join.approved"`. The accept handler logs `"join.requested"`.
   - What's unclear: Should the inline auto-approval emit `"join.auto_approved"` or call `logActivity` with `"join.approved"` as well?
   - Recommendation: Log both `"join.requested"` and `"join.auto_approved"` in sequence (or a single `"join.auto_approved"` that subsumes both). Either is fine for v1 since this is observability only.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.5 |
| Config file | `server/vitest.config.ts` |
| Quick run command | `cd server && pnpm vitest run src/__tests__/invite-accept-replay.test.ts` |
| Full suite command | `cd server && pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Human invite accept returns `status='approved'` and `companyId` | unit (route mock) | `cd server && pnpm vitest run src/__tests__/invite-auto-approve.test.ts` | Wave 0 |
| AUTH-01 | `onSuccess` navigates to `/` when `payload.status === 'approved'` | unit (UI) | `cd ui && pnpm vitest run src/pages/InviteLanding.test.tsx` | Wave 0 |
| AUTH-02 | `authenticated` mode activates BetterAuth session in actorMiddleware | unit (existing) | `cd server && pnpm vitest run src/__tests__/health.test.ts` | Already exists |
| AUTH-03 | `local_trusted` mode sets `local_implicit` actor unchanged | unit (existing) | `cd server && pnpm vitest run src/__tests__/health.test.ts` | Already exists |

### Sampling Rate
- **Per task commit:** `cd server && pnpm vitest run src/__tests__/invite-auto-approve.test.ts`
- **Per wave merge:** `cd server && pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/src/__tests__/invite-auto-approve.test.ts` — covers AUTH-01 server side (human accept returns approved joinRequest with companyId)
- [ ] `ui/src/pages/InviteLanding.test.tsx` — covers AUTH-01 UI side (navigate called when status=approved)

## Sources

### Primary (HIGH confidence)
- `server/src/routes/access.ts` — full invite accept handler (lines 2145-2535) and approve handler (2597-2741); all transaction and membership patterns read directly
- `server/src/middleware/auth.ts` — actorMiddleware; local_trusted vs authenticated branching (lines 24-27, 33-73) read directly
- `server/src/auth/better-auth.ts` — BetterAuth instance, `authDisableSignUp` config (line 92), trustedOrigins derivation read directly
- `server/src/config.ts` — `deploymentMode` config (line 140), `authDisableSignUp` (lines 169-173) read directly
- `ui/src/pages/InviteLanding.tsx` — full invite UI, `requiresAuthForHuman` (line 86), `acceptMutation.onSuccess` (line 107), button label (line 325) read directly
- `ui/src/pages/Auth.tsx` — full auth page, `?next=` handling (line 22), post-auth navigation (lines 47-51) read directly
- `docker/docker-compose.quickstart.yml` — env var reference deployment config read directly
- `packages/shared/src/types/access.ts` — `JoinRequest` interface shape (lines 51-73) read directly

### Secondary (MEDIUM confidence)
- None required — all critical information sourced from codebase directly.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; everything verified from source files
- Architecture: HIGH — exact transaction boundary, membership calls, and UI navigation all read from production code
- Pitfalls: HIGH — derived from reading actual guards, transaction structure, and query invalidation order in the codebase

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable internal codebase; no external library churn risk)
