# Architecture Patterns: Human-Agent Hybrid Task Management

**Domain:** Human-AI hybrid task system layered onto an existing AI orchestration platform
**Researched:** 2026-04-03
**Overall confidence:** HIGH (grounded in actual codebase + current external sources)

---

## Recommended Architecture

### Governing Principle: Unified Task Model

The most important architectural decision is already made and correct: **use the same `issues` table for human and AI tasks**. Do not introduce a parallel entity. The schema already supports this fully — `assigneeAgentId` (FK to `agents`) and `assigneeUserId` (plain text user ID) coexist on every issue row. `assertAssignableUser` in `server/src/services/issues.ts` already validates user membership before assignment.

The architectural challenge is not the data model. It is building the **identity layer**, **permission gates**, and **UI surfaces** that make human workers first-class participants alongside AI agents.

---

## Component Boundaries

### Component Map

```
┌──────────────────────────────────────────────────────────────────┐
│  IDENTITY LAYER (already exists, minor gaps)                     │
│                                                                  │
│  better-auth (server/src/auth/)                                  │
│    ↕ session cookies                                             │
│  req.actor middleware (server/src/middleware/auth.ts)            │
│    → actor.type = "board" | "agent" | "none"                     │
│    → actor.userId populated for board actors                     │
│                                                                  │
│  company_memberships table                                        │
│    principalType = "user" | "agent" | "board"                    │
│    membershipRole = "owner" | null                               │
│    status = "active" | "inactive"                                │
│                                                                  │
│  accessService (server/src/services/access.ts)                   │
│    listMembers, listActiveUserMemberships,                       │
│    setMemberPermissions, hasPermission                           │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  INVITE / ONBOARDING LAYER (partially exists)                    │
│                                                                  │
│  access.ts route (server/src/routes/access.ts)                   │
│    POST /companies/:id/invites  → creates invite token           │
│    POST /invites/accept         → creates membership             │
│    GET /companies/:id/members   → listMembers                    │
│                                                                  │
│  invites table (packages/db/src/schema/invites.ts)               │
│  InviteLanding.tsx page (ui/src/pages/InviteLanding.tsx)         │
│    already exists for agent join flows                           │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  TASK ASSIGNMENT LAYER (backend fully exists, UI partial)        │
│                                                                  │
│  issueService (server/src/services/issues.ts)                    │
│    IssueFilters.assigneeUserId already implemented               │
│    assertAssignableUser validates membership before assign       │
│    status transitions: backlog→todo→in_progress→in_review→done  │
│                                                                  │
│  issues route (server/src/routes/issues.ts)                      │
│    GET /issues?assigneeUserId=me   → already implemented          │
│    PATCH /issues/:id               → status + assignee updates   │
│    POST /issues/:id/attachments    → file uploads (multer)       │
│    POST /issues/:id/comments       → comment thread              │
│                                                                  │
│  issue_attachments table           already exists                │
│  issue_comments table              already exists                │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  PERMISSION GATE LAYER (exists but needs human-specific paths)   │
│                                                                  │
│  authz.ts (server/src/routes/authz.ts)                           │
│    assertCompanyAccess → checks actor.companyIds                 │
│    getActorInfo        → returns actorType "user" | "agent"      │
│                                                                  │
│  principal_permission_grants table                               │
│    permissionKey: "tasks:assign", "tasks:view", etc.             │
│    scope: nullable (company-wide or scoped to project)           │
│                                                                  │
│  KEY GAP: no "human member can only modify their OWN tasks"      │
│  permission check. Currently any board actor can update any      │
│  issue in their company. Need: owner can assign to anyone,       │
│  member can only change status/attachments on their own tasks.   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  UI SURFACE LAYER (mostly to build)                              │
│                                                                  │
│  MyIssues.tsx (ui/src/pages/MyIssues.tsx)                        │
│    EXISTS but uses wrong filter: excludes assigned issues        │
│    Needs rewrite to use ?assigneeUserId=me                       │
│                                                                  │
│  Issues.tsx (ui/src/pages/Issues.tsx)                            │
│    Needs "Assigned to me" filter toggle                          │
│                                                                  │
│  IssueDetail.tsx (ui/src/pages/IssueDetail.tsx)                  │
│    Needs human-aware action bar (status change, attach, reassign)│
│                                                                  │
│  Org.tsx / OrgChart.tsx (ui/src/pages/)                          │
│    Currently AI-agent only; needs human members blended in       │
│                                                                  │
│  TeamWorkload view (NEW)                                         │
│    Show assigned tasks per member (human + AI) for owner view    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  REALTIME LAYER (fully exists, no changes needed)                │
│                                                                  │
│  publishLiveEvent → EventEmitter → live-events-ws.ts             │
│  LiveUpdatesProvider → TanStack Query cache invalidation         │
│                                                                  │
│  Human task changes (status update, new comment, attachment)     │
│  should call publishLiveEvent — already happens via the          │
│  existing issues route mutation paths.                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `better-auth` + `auth.ts` middleware | Resolves session → `req.actor.userId` | All routes |
| `company_memberships` table | Single source of truth: who belongs to which company | `accessService`, `issueService.assertAssignableUser`, auth checks |
| `accessService` | Membership CRUD, permissions, invites | `access.ts` route, `issues.ts` route |
| `invites` table | Time-limited invite tokens for human onboarding | `accessService`, `InviteLanding.tsx` |
| `issueService` + `issues` route | Issue CRUD, assignment, status transitions, attachment uploads | All issue-related UI |
| Permission gate in `issues.ts` route | Owner-only vs. member-only action enforcement | `authz.ts`, `accessService.hasPermission` |
| `MyIssues.tsx` | Human worker's primary task dashboard | `issuesApi.list({ assigneeUserId: "me" })` |
| `IssueDetail.tsx` | Per-task work surface for human actors | `issuesApi`, `assetsApi`, comments API |
| `Org.tsx` | Combined human + AI member roster | `agentsApi.org`, new `membersApi` |
| `LiveUpdatesProvider` | Push status updates to all connected clients | WebSocket, TanStack Query |

---

## Data Flow

### Human Receiving and Working a Task

```
Owner assigns issue to human user
  → PATCH /api/issues/:id { assigneeUserId: "user_abc" }
  → issueService.updateIssue validates via assertAssignableUser
  → DB write: issues.assigneeUserId = "user_abc"
  → publishLiveEvent({ type: "issue.updated", ... })
  → WebSocket → LiveUpdatesProvider → query cache invalidated
  → Human's MyIssues.tsx re-renders with the new task

Human opens IssueDetail.tsx
  → GET /api/issues/:identifier
  → Server checks assertCompanyAccess
  → Returns full issue JSON including status, description, attachments

Human changes status to "in_progress"
  → PATCH /api/issues/:id { status: "in_progress" }
  → applyStatusSideEffects sets startedAt = now()
  → publishLiveEvent → owner's UI updates in real time

Human attaches a file
  → POST /api/issues/:id/attachments (multipart/form-data)
  → StorageService writes to local disk or S3
  → issue_attachments row created
  → publishLiveEvent

Human reassigns to AI agent
  → PATCH /api/issues/:id { assigneeUserId: null, assigneeAgentId: "agent_xyz" }
  → queueIssueAssignmentWakeup fires → heartbeat picks up the run
  → AI agent execution begins via adapter
```

### Owner Managing Team

```
Owner navigates to Org / Team view
  → GET /api/companies/:id/members (listMembers)
  → GET /api/agents?companyId=:id (for AI agents)
  → Combined roster rendered: human members + AI agents

Owner assigns issue from dashboard
  → PATCH /api/issues/:id { assigneeUserId | assigneeAgentId }
  → Same assignment path as above
  → Target (human or AI) sees it in their view
```

### Human Invitation Flow

```
Owner triggers invite
  → POST /api/companies/:id/invites { email? or link-only }
  → access.ts creates invite token in `invites` table
  → Returns invite link (token embedded)

Invitee clicks link → InviteLanding.tsx
  → POST /api/invites/accept { token, ... }
  → accessService validates token, creates company_membership
    { principalType: "user", principalId: userId, membershipRole: null }
  → User can now see the company and their assigned tasks
```

---

## Patterns to Follow

### Pattern 1: Actor-Scoped Issue Mutations

Every issue mutation route already calls `getActorInfo(req)` to get `actorType` and `actorId`. Extend this to enforce **ownership checks** on human-specific mutations:

```typescript
// In issues.ts route, for status-change or attach:
const actorInfo = getActorInfo(req);
if (actorInfo.actorType === "user") {
  // A human member can only change status/attach on issues assigned to them
  // unless they are an owner (membershipRole === "owner")
  const isOwner = await access.isOwner(companyId, actorInfo.actorId);
  if (!isOwner && existing.assigneeUserId !== actorInfo.actorId) {
    throw forbidden("You can only modify tasks assigned to you");
  }
}
```

**Why:** Without this, any authenticated user in the company can mutate any issue. This is fine for the current single-operator model but breaks when multiple humans share a company.

### Pattern 2: Unified Member Roster via API Composition

The Org page currently calls `agentsApi.org()` only. Human members need to be fetched separately and merged in the UI layer:

```typescript
// In a new TeamPage or extended Org.tsx:
const { data: agents } = useQuery(queryKeys.org(companyId), () => agentsApi.org(companyId));
const { data: members } = useQuery(queryKeys.members(companyId), () => membersApi.list(companyId));

// Render both as rows in the same tree
const everyone = [
  ...(agents ?? []).map(a => ({ kind: "agent", ...a })),
  ...(members ?? []).map(m => ({ kind: "human", ...m })),
];
```

**Why:** No new data model. Composition at the UI query layer keeps backend concerns separate.

### Pattern 3: "assigneeUserId=me" Filter Pattern

The backend already supports `GET /api/issues?assigneeUserId=me`. The `MyIssues.tsx` page currently applies the wrong client-side filter (excludes assigned issues). The fix is to use the backend filter:

```typescript
// Correct implementation for MyIssues.tsx
const { data: issues } = useQuery({
  queryKey: queryKeys.issues.list(companyId, { assigneeUserId: "me" }),
  queryFn: () => issuesApi.list(companyId, { assigneeUserId: "me" }),
});
```

This keeps filter logic server-side and works correctly with TanStack Query cache invalidation on live events.

### Pattern 4: Bidirectional Handoff via Standard Issue Mutation

Human-to-AI reassignment and AI-to-human escalation are the same operation: a `PATCH /issues/:id` with a changed assignee. The `queueIssueAssignmentWakeup` function already handles waking the AI execution path when `assigneeAgentId` is set. No new mechanism is needed.

```
Human completes subtask, wants AI to pick up next step:
  PATCH { assigneeAgentId: "agent_xyz", assigneeUserId: null }
  → queueIssueAssignmentWakeup fires automatically
  → heartbeat scheduler picks it up
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate "Human Task" Entity

**What it is:** Creating a new DB table (e.g., `human_tasks`) separate from `issues` to manage human work.

**Why bad:** Breaks every existing query, filter, and view that operates on `issues`. The existing schema (`assigneeUserId`, `assigneeAgentId`, status workflow, attachments, comments, subtasks) fully covers human task needs. Diverging the data model creates indefinite synchronization debt.

**Instead:** Use `issues` with `assigneeUserId` populated. All existing infrastructure (realtime, filters, subtasks, attachments) works immediately.

### Anti-Pattern 2: Replicating the Auth System

**What it is:** Adding a second authentication mechanism (separate JWT issuer, separate session table) for human members.

**Why bad:** `better-auth` is already integrated and handles multi-user sessions. The `req.actor` middleware already populates `userId` for board actors. Parallel auth creates conflicting identity resolution.

**Instead:** Extend the existing `better-auth` user pool. Human members are `principalType: "user"` in `company_memberships`. No new auth infrastructure needed.

### Anti-Pattern 3: Polling for Task Updates

**What it is:** Human dashboard polls `GET /api/issues?assigneeUserId=me` on a timer.

**Why bad:** The WebSocket + LiveEvent system already pushes updates to the browser. TanStack Query cache is invalidated on every relevant `LiveEvent`. Polling adds latency and unnecessary load.

**Instead:** The `LiveUpdatesProvider` already handles this. The human dashboard will receive real-time updates the same way the AI run view does — zero additional work needed at the infrastructure level.

### Anti-Pattern 4: Role Explosion

**What it is:** Introducing a complex role hierarchy (admin, manager, member, viewer, etc.) for human members.

**Why bad:** `principal_permission_grants` already models fine-grained permissions per key. Adding named roles that map to permission sets adds indirection without value for v1.

**Instead:** Use the binary `membershipRole: "owner" | null` already in `company_memberships`. The owner can do everything; other members can only act on their own tasks. Extend permissions incrementally if v2 needs it.

---

## Suggested Build Order

Dependencies flow from data/identity outward to UI surfaces.

```
Phase 1: Identity & Membership Foundation
  ├── Verify/extend invite flow for human email invites
  ├── Expose GET /companies/:id/members in a human-readable format
  │     (currently listMembers returns raw membership rows,
  │      needs join to auth_users for display names/emails)
  └── Fix MyIssues.tsx to use ?assigneeUserId=me backend filter

Phase 2: Task Work Surface
  ├── Owner-scoped permission check in issues route
  │     (human member can only act on their own tasks)
  ├── Human action bar in IssueDetail.tsx
  │     (status change, attach file, create subtask)
  └── "Assigned to me" toggle in Issues.tsx list view

Phase 3: Team Visibility
  ├── Unified org/team view (human + AI members in one roster)
  └── Per-member workload view (assigned issues per member)
```

**Why this order:**
- Phase 1 is the prerequisite for everything: a human must be able to join and see their tasks before any UI work on IssueDetail matters.
- Phase 2 delivers core human worker value — they can receive and complete work.
- Phase 3 delivers owner value — visibility into team capacity. It depends on Phase 1's membership API being solid.

---

## Scalability Considerations

| Concern | At current scale (1 org, mostly AI) | At 10-50 human members | Notes |
|---------|--------------------------------------|------------------------|-------|
| `assigneeUserId` index | `issues_company_assignee_user_status_idx` already exists | Sufficient | No migration needed for Phase 1-2 |
| Live events per company | One WS connection per company | Same — broadcast to all members in company | WebSocket fan-out stays constant per company |
| Member roster query | `listMembers` is a simple scan on `company_memberships` | Negligible for <100 members | No pagination needed for v1 |
| Auth session load | Single user per company today | Linear growth; better-auth handles it | No architectural change needed |

---

## Key Integration Points (Where New Code Touches Existing)

| Existing File | What Needs Changing |
|--------------|---------------------|
| `server/src/services/access.ts` | Add `getHumanMembersWithUserInfo()` that joins `auth_users` for display names |
| `server/src/routes/issues.ts` | Add owner/self permission check for human actor mutations |
| `ui/src/pages/MyIssues.tsx` | Rewrite filter to use `?assigneeUserId=me` query param |
| `ui/src/pages/IssueDetail.tsx` | Add human action bar (conditional on `issue.assigneeUserId === currentUserId`) |
| `ui/src/pages/Org.tsx` | Blend human members into the existing org tree rendering |
| `ui/src/api/issues.ts` | Pass `assigneeUserId` as optional query param in `list()` |
| `packages/shared/src/types/` | Add `HumanMember` type for the new member roster API response |

---

## Sources

- Current codebase analysis: `server/src/services/issues.ts`, `server/src/routes/issues.ts`, `server/src/services/access.ts`, `packages/db/src/schema/issues.ts`, `packages/db/src/schema/company_memberships.ts` (HIGH confidence — direct code read)
- [Microsoft Azure Architecture Center: AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) — Group chat / handoff / human-in-loop patterns (MEDIUM confidence)
- [Stack AI: 2026 Guide to Agentic Workflow Architectures](https://www.stackai.com/blog/the-2026-guide-to-agentic-workflow-architectures) — Graduated autonomy / human checkpoint patterns (MEDIUM confidence)
- [MyEngineeringPath: Human-in-the-Loop Patterns for AI Agents](https://myengineeringpath.dev/genai-engineer/human-in-the-loop/) — Synchronous vs. asynchronous vs. calibrated autonomy patterns (MEDIUM confidence)
