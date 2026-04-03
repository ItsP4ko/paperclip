# Technology Stack: Human Agent Support

**Project:** Paperclip — Human Agents Milestone
**Researched:** 2026-04-03
**Scope:** What to add/use to extend existing stack for human task management

---

## Orientation: What This Is NOT

This milestone is **not** a new project. It is a UI + permission layer built on top of an already-working
backend. The codebase audit found:

- `assigneeUserId` already exists on the `issues` table (DB column `assignee_user_id`)
- `companyMemberships` already stores `principalType: "user"` rows
- `membershipRole: "owner"` concept already exists
- `accessService.listMembers()` and `GET /companies/:companyId/members` already exist
- `allowedJoinTypes: "human" | "agent" | "both"` already in invite system
- `createIssueSchema` and `updateIssueSchema` already accept `assigneeUserId`
- `PERMISSION_KEYS` already contains `tasks:assign`, `users:invite`, `users:manage_permissions`
- `MyIssues` page already exists but uses incorrect filtering (filters on `!assigneeAgentId` instead
  of `assigneeUserId === currentUserId`)
- `issuesApi.list()` already supports `assigneeUserId` filter param

**Conclusion:** ~80% of the required backend surface area already exists. The work is:
1. Fix/extend existing UI (MyIssues filter logic, add it to routing/nav)
2. Build a human member management UI in CompanySettings
3. Add a team workload view (who has what assigned)
4. Tighten permission checks for human actors on issue mutations

---

## Recommended Stack

### No New Frameworks — Zero Net-New Dependencies Needed

The constraint from PROJECT.md ("Mantener React 19 + Vite + Tailwind v4 + shadcn/ui — no introducir
frameworks nuevos") is achievable. Every capability needed already exists in the stack.

### Core Framework (Already In Place)

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| React | 19.0.0 | UI framework | Already installed |
| Vite | 6.1.0 | Build / dev server | Already installed |
| Tailwind CSS | 4.0.7 | Styling | Already installed via `@tailwindcss/vite` |
| React Router DOM | 7.1.5 | Client-side routing | Already installed |
| TanStack React Query | 5.x | Server state, caching, mutations | Already installed |

**Confidence: HIGH** — direct inspection of `packages/db`, `server/src`, and `ui/src`.

### Auth (Already In Place)

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| better-auth | 1.4.18 | Session management | Already in use |
| `authApi.getSession()` | — | Current user context | Returns `{ user: { id, email, name } }` |

The `queryKeys.auth.session` query already loads the current user in `App.tsx`. The `user.id` from
this session is what gets matched against `assigneeUserId` on issues.

**Do not** add a separate auth system, JWT layer, or user profile service. Pass `user.id` down from the
existing session query.

**Confidence: HIGH** — read `ui/src/api/auth.ts` and `ui/src/App.tsx` directly.

### Database (Already In Place — Extend Only)

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| Drizzle ORM | 0.38.4 | Query builder | Already in use across server + db package |
| PostgreSQL | — | Data store | Via `embedded-postgres` or external |

Required schema changes are minimal:
- No new tables needed for MVP
- The `companyMemberships` table already stores user members
- The `issues` table already has `assignee_user_id`

**Confidence: HIGH** — read `packages/db/src/schema/company_memberships.ts` and
`packages/db/src/schema/issues.ts` directly.

### UI Components (Already In Place — Extend Only)

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| shadcn/ui | (via Radix UI) | Component primitives | Already installed |
| Radix UI | — | Headless primitives | Already installed |
| lucide-react | — | Icons | Already installed |

Available shadcn components already present: `avatar`, `badge`, `button`, `card`, `checkbox`,
`dialog`, `dropdown-menu`, `input`, `label`, `select`, `skeleton`, `tabs`, `tooltip`.

The `avatar` component is available and should be used for human member display (initials fallback,
no avatar upload needed for MVP).

**Confidence: HIGH** — read `ui/src/components/ui/` directory directly.

### Supporting Libraries (Already In Place)

| Library | Purpose | Notes |
|---------|---------|-------|
| `@dnd-kit/core` + `@dnd-kit/sortable` | Drag-and-drop (if task reordering added) | Already present, use if needed |
| `zod` 3.24.x | Request body validation (server) | Already in use in all route validators |
| `clsx` + `tailwind-merge` | Class composition | Already in use |
| `class-variance-authority` | Variant-based component styles | Already in use |

---

## What NOT to Use

### Do Not Add a Separate Task/Project Management Library

**Why not:** Libraries like `react-beautiful-dnd`, `@hello-pangea/dnd`, or dedicated "task board"
packages add bundle weight and fight with the existing `@dnd-kit` setup already in the codebase.
Extend existing issue list patterns using `EntityRow` + `FilterBar` components.

### Do Not Add a Notification Library

**Why not:** PROJECT.md explicitly excludes email/push notifications from MVP scope. The
web-app-first approach means users check in proactively. Adding `react-hot-toast`, `sonner`, or
similar for cross-session notifications is out of scope.

### Do Not Add a Separate State Management Library

**Why not:** TanStack Query 5 already handles all server state. The existing `CompanyContext` and
`DialogContext` cover the minimal global UI state needed. Do not introduce Zustand, Jotai, or Redux
for this milestone — the session user ID can be passed via the existing query pattern.

### Do Not Add a New Form Library

**Why not:** The existing pattern uses controlled React state + `useMutation` from TanStack Query for
forms (confirmed in `CompanySettings.tsx`, `AgentConfigForm.tsx`). Adding React Hook Form or Formik
would be inconsistent with the codebase style and create cognitive overhead. Follow the existing
pattern.

### Do Not Add a Real-Time Presence Layer

**Why not:** The existing WebSocket layer (`ws` 8.x via `live-events-ws.ts`) handles live updates.
"Online/offline" presence indicators for human members are out of scope for MVP. Do not add
`Pusher`, `Ably`, or similar.

---

## Gap Analysis: What Needs to Be Built vs Extended

### Frontend Gaps (UI work required)

| Gap | Current State | What to Build |
|-----|--------------|--------------|
| MyIssues filter logic | Filters on `!assigneeAgentId` (wrong) | Filter on `assigneeUserId === session.user.id` via existing `issuesApi.list({ assigneeUserId })` |
| MyIssues route in nav | Page exists but not in `App.tsx` routes | Add `<Route path="my-tasks" element={<MyIssues />} />` and nav link |
| Human member list in CompanySettings | Not present | Query `GET /companies/:id/members`, filter `principalType === "user"`, render with `avatar` + `badge` |
| Assign-to-human in issue form | `NewIssueDialog` / `updateIssue` support `assigneeUserId` in API | Add a human assignee selector alongside the existing agent assignee selector |
| Team workload view | Not present | New page or tab: list human members, each showing their open issues via `issuesApi.list({ assigneeUserId })` |
| Invite human flow | `createCompanyInvite({ allowedJoinTypes: "human" })` exists in API | Add a UI trigger in CompanySettings that calls `accessApi.createCompanyInvite` with `allowedJoinTypes: "human"` |

### Backend Gaps (small surface area)

| Gap | Current State | What to Build |
|-----|--------------|--------------|
| `GET /companies/:id/members` returns raw membership rows | Returns `companyMemberships` rows without user name/email | Join with `authUsers` table to return `{ id, userId, name, email, membershipRole }` |
| Permission check for human updating issue status | `PATCH /issues/:id` exists; human actor path needs validation | Verify `assertAssignableUser` covers the human-actor status-change case; add test |
| `tasks:assign` permission auto-grant for owner | Owners need to assign tasks to others | Ensure `membershipRole: "owner"` gets `tasks:assign` granted on join |

**Confidence: HIGH** — all gaps identified from direct code inspection, not inference.

---

## Session User in Frontend: Access Pattern

The current user's ID is available via the existing `queryKeys.auth.session` query. To use it in
components, follow this pattern (consistent with how `App.tsx` already uses it):

```typescript
// In any component needing the current user
const { data: session } = useQuery({
  queryKey: queryKeys.auth.session,
  queryFn: () => authApi.getSession(),
});
const currentUserId = session?.user.id ?? null;
```

Then filter issues with:
```typescript
issuesApi.list(companyId, { assigneeUserId: currentUserId })
```

This is the correct fix for `MyIssues.tsx` which currently does not use `assigneeUserId` at all.

---

## Installation

No new packages to install. All required functionality uses existing dependencies.

---

## Sources

- Direct inspection: `packages/db/src/schema/company_memberships.ts`
- Direct inspection: `packages/db/src/schema/issues.ts`
- Direct inspection: `packages/shared/src/constants.ts` (PERMISSION_KEYS)
- Direct inspection: `packages/shared/src/validators/issue.ts` (createIssueSchema, updateIssueSchema)
- Direct inspection: `server/src/services/access.ts` (listMembers, listActiveUserMemberships)
- Direct inspection: `server/src/routes/access.ts` (GET /companies/:id/members)
- Direct inspection: `ui/src/api/access.ts` (createCompanyInvite with allowedJoinTypes)
- Direct inspection: `ui/src/api/issues.ts` (assigneeUserId filter param)
- Direct inspection: `ui/src/pages/MyIssues.tsx` (incorrect filter logic confirmed)
- Direct inspection: `ui/src/components/ui/` (available shadcn components)
- Direct inspection: `.planning/PROJECT.md` (constraints and scope)
