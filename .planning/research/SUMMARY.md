# Project Research Summary

**Project:** Paperclip — Human Agents Milestone
**Domain:** Human-AI hybrid task management (adding human workers as first-class agents in an existing AI orchestration platform)
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

This milestone is not a greenfield build. Approximately 80% of the required backend surface area already exists in the Paperclip codebase: `assigneeUserId` is on the issues table, `company_memberships` stores `principalType: "user"` rows, invite flows support `allowedJoinTypes: "human"`, and `issuesApi.list()` already filters by `assigneeUserId`. The entire tech stack is already in place — React 19, Vite, Tailwind v4, shadcn/ui, TanStack Query, Drizzle ORM, better-auth, and a WebSocket live-events layer. Zero new dependencies are required. The work is a UI + permission layer built on top of what exists.

The recommended approach is to treat this as three sequential layers: first establish that human identity and membership works end-to-end (invite, join, display), then give human workers a functional task workspace (My Tasks dashboard, status changes, file attachment), then give owners visibility into their mixed human-AI team (org roster, workload view). This dependency order is not arbitrary — a human cannot be assigned tasks until they appear in the assignee picker, and the assignee picker cannot be built until the membership API returns display names. Every phase depends on the one before it.

The most significant risks are behavioral rather than technical. The `MyIssues.tsx` page has a trust-breaking filter bug (shows all un-agent-assigned issues as "mine") that must be fixed before any human is onboarded. The assignee picker must visually separate humans from AI agents, or owners will assign tasks expecting autonomous execution. AI-to-human takeover of an in-progress issue silently cancels the AI run and drops context — the UI must warn and surface the AI's prior work. These are design and implementation care issues, not architectural unknowns.

---

## Key Findings

### Recommended Stack

No new frameworks or packages are needed. The constraint from PROJECT.md ("no introducir frameworks nuevos") is fully achievable — all required capabilities are already installed and in use. The only backend work is extending two existing services: `accessService.getHumanMembersWithUserInfo()` (a join to `auth_users` for display names) and a permission check in the issues route (human members can only mutate their own tasks). Every frontend gap uses patterns already established in the codebase.

**Core technologies:**
- React 19 + Vite 6 + Tailwind v4: UI framework — already installed, no changes
- TanStack Query 5: server state and cache invalidation — already handles live event integration
- better-auth 1.4.18: session management — `session.user.id` is the `assigneeUserId` reference
- Drizzle ORM 0.38.4 + PostgreSQL: data layer — no schema migrations needed for Phase 1-2
- shadcn/ui (Radix + lucide-react): components — `avatar`, `badge`, `tabs`, `dialog` already present
- WebSocket live-events layer: real-time updates — already pushes to all members in a company

### Expected Features

**Must have (table stakes):**
- "My Tasks" dedicated view with correct `assigneeUserId=me` filter — human workers have no entry point without it
- "Assigned to me" filter in main Issues list — standard across every work tool
- Human member appears in assignee picker alongside AI agents — invisible humans cannot be assigned work
- Owner can invite human by email/link — existing invite system with `allowedJoinTypes: "human"` needs verified end-to-end
- Change task status from My Tasks and Issue detail — core action of a human worker
- Human members visible in org/member list — owners need to see who is on the team

**Should have (differentiators):**
- Assignee picker groups humans vs. AI agents with clear labels — prevents accidental "assign to human thinking it will auto-execute"
- Bidirectional handoff: human → AI with no context loss (structurally free — same issue entity)
- Human inbox filtered to actionable tasks only (todo/in_progress, not backlog/done)
- Owner-managed invite link UI exposed in CompanySettings
- Sidebar badge count for "tasks assigned to me" — without this, human members have no attention signal

**Defer (v2+):**
- Team workload view (human + AI tasks side by side): valuable but higher complexity
- Assigned-by-me / delegation history for owners
- Activity log attribution for human actors ("Alice changed status to In Review")
- Automation triggers on human task completion
- Email/push notifications

### Architecture Approach

The governing principle is the unified task model — the same `issues` table serves both human and AI work. This architectural decision is already made and correct. The challenge is building the identity layer, permission gates, and UI surfaces that make human workers first-class participants. The system is structured as five layers: identity (better-auth + company_memberships), invite/onboarding (existing routes + InviteLanding.tsx), task assignment (issueService + issues route), permission gates (authz.ts + principal_permission_grants), and UI surfaces (MyIssues, IssueDetail, Org, new Members view). The real-time layer requires no changes — live events already propagate human task mutations to all connected clients.

**Major components:**
1. `accessService.getHumanMembersWithUserInfo()` (new method) — joins `auth_users` to return display names/emails alongside membership rows; consumed by all UI that lists members
2. Permission gate in `issues.ts` route (new check) — human members can only change status or attach files on issues assigned to them; owners bypass this check
3. `MyIssues.tsx` (rewrite filter) — switch from `!assigneeAgentId` to `?assigneeUserId=me` backend query; this is the human worker's primary workspace
4. Unified assignee picker (extend existing) — union human members and AI agents in one component with distinct sections; used in NewIssueDialog, IssueDetail, CommandPalette
5. Members page / Org.tsx extension — separate "Team Members" section for humans; keep agent org chart AI-only to avoid broken status indicators and dead links

### Critical Pitfalls

1. **Wrong MyIssues filter (Pitfall 2)** — existing `!assigneeAgentId` predicate shows all unassigned AI-destined issues as the user's own tasks; fix to `?assigneeUserId=me` API endpoint before any human is onboarded or you get a trust-breaking UX failure on first use.

2. **Dual-assignee 422 on reassignment (Pitfall 1)** — the service enforces that `assigneeAgentId` and `assigneeUserId` cannot coexist; any UI button that sets one without explicitly nulling the other produces a 422; build a single `setAssignee(agentId | userId | null)` client utility that always sends both fields atomically.

3. **Flat assignee picker mixes humans and AI agents (Pitfall 9)** — owners assign tasks to humans expecting autonomous execution; group the picker into "Team Members" vs. "AI Agents" sections with clear labels before any human can be assigned.

4. **Silent AI run cancellation on takeover (Pitfall 5)** — reassigning an in-progress AI issue to a human clears `checkoutRunId` and cancels the AI run with no warning; the UI must prompt the owner before confirming and surface the AI's prior activity log as context for the human.

5. **No badge count for human task attention (Pitfall 3)** — `sidebar-badges.ts` counts only failed runs, alerts, and approvals; human workers see badge=0 and assume they have nothing to do; add a `myTasks` count computed conditionally on `req.actor.type === "board"`.

---

## Implications for Roadmap

Based on combined research, dependencies flow from data/identity outward to UI surfaces. The backend is largely done; the sequencing risk is entirely in the order UI is built.

### Phase 1: Identity, Membership, and My Tasks Foundation

**Rationale:** A human member must be able to join the company and see their tasks before any other UI work has value. This phase is the prerequisite for everything downstream. It also fixes the most dangerous existing bug (MyIssues filter).

**Delivers:** End-to-end human onboarding; a working personal task dashboard; sidebar badge count for task attention.

**Addresses:** Table stakes — "My Tasks" view, "Assigned to me" baseline, owner invite flow.

**Avoids:** Pitfall 2 (wrong filter), Pitfall 3 (missing badge count), Pitfall 11 (rebuilding invite backend — UI only).

**Implementation notes:**
- Fix `MyIssues.tsx` filter to `?assigneeUserId=me`
- Add `myTasks` count to `sidebar-badges.ts` (conditional on board actor)
- Expose invite link creation in CompanySettings (UI trigger only — backend `createCompanyInvite` with `allowedJoinTypes: "human"` already exists)
- Extend `GET /companies/:id/members` to join `auth_users` for display name + email
- Add `MyIssues` route to `App.tsx` navigation

### Phase 2: Task Work Surface for Human Workers

**Rationale:** Once a human can join and see their tasks, they need to act on them. This phase delivers the core value — humans can receive, work, and complete tasks in the platform.

**Delivers:** Status change affordance in My Tasks and IssueDetail; file attachment from IssueDetail; subtask creation; bidirectional reassignment to AI agents.

**Addresses:** Table stakes — change task status, attach files, create subtasks, reassign to AI agent.

**Avoids:** Pitfall 1 (dual-assignee 422), Pitfall 5 (silent AI run cancellation), Pitfall 6 (human completion triggers — label as manual-only), Pitfall 10 (context loss on handoff — prompt for handoff note).

**Implementation notes:**
- Build `setAssignee(agentId | userId | null)` atomic client utility
- Add human action bar in `IssueDetail.tsx` (conditional on `issue.assigneeUserId === currentUserId`)
- Add owner/self permission check in issues route (human member can only mutate own tasks)
- Show interruption warning + AI activity log when taking over an in-progress AI issue
- Add "Assigned to me" filter toggle in main `Issues.tsx`
- Set `staleTime: 0, refetchInterval: 30_000` on My Tasks query for near-real-time updates without full push infra

### Phase 3: Team Visibility for Owners

**Rationale:** Once the human worker's experience is solid, owners need visibility into the mixed human-AI team. This phase depends on Phase 1's membership API and Phase 2's assignment data being stable.

**Delivers:** Human members visible in org/team roster; per-member workload summary; unified assignee picker across all issue surfaces.

**Addresses:** Table stakes — human members visible in org list, owner can assign tasks to humans. Differentiator — team workload view.

**Avoids:** Pitfall 4 (org chart broken for humans — build separate Members section, keep agent org chart AI-only), Pitfall 7 (missing `resolveAssigneeName()` helper), Pitfall 9 (flat assignee picker).

**Implementation notes:**
- Build `resolveAssigneeName(issue)` helper that checks both `assigneeAgentId` and `assigneeUserId` before rendering
- Blend human members into `Org.tsx` as a separate section (not inside the agent org tree)
- Unified assignee picker with "Team Members" / "AI Agents" groups in `NewIssueDialog`, `IssueDetail`, `CommandPalette`
- Team workload view: aggregate open issue counts per member using `issuesApi.list({ assigneeUserId })`

### Phase Ordering Rationale

- Phase 1 must come first because membership/identity are prerequisites for assignment, and the filter bug makes My Tasks unusable for real humans
- Phase 2 before Phase 3 because the assignee picker (Phase 3) depends on the `setAssignee` utility and permission gates (Phase 2) being correct
- Owner visibility (Phase 3) is genuinely last — owners get the most value once human workers are actually using the system and generating task data
- No phase requires schema migrations; all DB changes are limited to a query join in `accessService`

### Research Flags

Phases with standard patterns (no deeper research needed):
- **Phase 1 — My Tasks filter fix, badge count, invite UI:** Well-documented patterns, all code paths already exist in codebase
- **Phase 1 — Membership API join:** Simple Drizzle join to `auth_users`, established pattern in this codebase
- **Phase 2 — Status change, file attachment, subtask UI:** Existing issue detail patterns, extend rather than invent
- **Phase 3 — Assignee picker grouped UI:** shadcn/ui `Select` with optgroup or `Command` component grouping — standard pattern

Phases likely needing extra care during planning (not external research, but implementation scrutiny):
- **Phase 2 — `setAssignee` atomic utility:** Dual-assignee enforcement is a known pitfall; design the client contract carefully before building any reassignment UI
- **Phase 2 — AI run interruption warning:** Requires reading `checkoutRunId` and fetching the run's activity log before confirming reassignment; data flow needs explicit planning
- **Phase 3 — `resolveAssigneeName()` audit:** Requires auditing every component that renders assignee before shipping Phase 3; missing display name is a silent visual bug

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct inspection of all package.json files, schema files, and source code — no inference |
| Features | HIGH | Grounded in codebase analysis plus verified against Linear, Asana, and Wrike analogues |
| Architecture | HIGH | All component boundaries and data flows verified against actual server and DB source files |
| Pitfalls | HIGH | Most pitfalls discovered via direct code reading (wrong filter in MyIssues.tsx, badge count omission, dual-assignee guard in issueService) — not hypothetical |

**Overall confidence:** HIGH

### Gaps to Address

- **InviteLanding.tsx human join end-to-end:** The backend supports `allowedJoinTypes: "human"` but the invite landing page's behavior for human join vs. agent join has not been fully traced. Phase 1 should begin with a manual end-to-end test of the human invite flow before building owner UI.
- **`tasks:assign` auto-grant for owners on join:** Research flagged that `membershipRole: "owner"` needs `tasks:assign` granted automatically at join time. Verify in `accessService` whether this is already applied or needs a one-line addition.
- **`principalType: "board"` vs. `"user"` distinction:** The actor middleware uses `"board"` for session-authenticated users. Some permission checks use `"user"`. Confirm these map to the same concept before building the human-specific permission gate in Phase 2.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `packages/db/src/schema/issues.ts`, `packages/db/src/schema/company_memberships.ts`
- Direct codebase inspection: `server/src/services/issues.ts`, `server/src/services/access.ts`, `server/src/routes/issues.ts`, `server/src/routes/access.ts`, `server/src/routes/sidebar-badges.ts`
- Direct codebase inspection: `packages/shared/src/constants.ts` (PERMISSION_KEYS), `packages/shared/src/validators/issue.ts`
- Direct codebase inspection: `ui/src/pages/MyIssues.tsx`, `ui/src/pages/InviteLanding.tsx`, `ui/src/pages/Org.tsx`, `ui/src/api/auth.ts`, `ui/src/App.tsx`
- `.planning/PROJECT.md` — scope constraints and out-of-scope decisions

### Secondary (MEDIUM confidence)
- [Linear "My Issues" view](https://www.storylane.io/tutorials/how-to-use-linears-my-issues-view) — personal workspace tab structure
- [Asana AI Teammates](https://asana.com/product/ai/ai-teammates) — human-AI parity model and co-equal team member patterns
- [Orkes HITL workflow features](https://orkes.io/blog/human-in-the-loop/) — task routing and state transition patterns
- [Microsoft Azure: AI Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) — group chat, handoff, human-in-loop patterns
- [How Agent Handoffs Work](https://towardsdatascience.com/how-agent-handoffs-work-in-multi-agent-systems/) — context preservation on reassignment

### Tertiary (LOW confidence)
- [2026: Year to move from human-in-loop to humans-above-loop](https://diginomica.com/2026-year-move-human-in-loop-to-humans-above-loop) — directional framing only
- [Common Failure Modes of Human-AI Collaboration](https://skillseek.eu/answers/common-failure-modes-of-human-ai-collaboration) — general patterns, not Paperclip-specific

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*
