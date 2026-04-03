# Feature Landscape: Human Agents in Paperclip

**Domain:** Human-AI hybrid task management — adding human workers as first-class agents in an existing AI orchestration platform
**Researched:** 2026-04-03
**Overall confidence:** HIGH (grounded in codebase analysis + current ecosystem research)

---

## Context

Paperclip already has `assigneeUserId` on issues, `company_memberships` with `principalType: "user"`, invite/join flows, and an issue state machine (backlog/todo/in_progress/in_review/done). The gap is entirely in the **human-facing UX**: a human member has no focused workspace, cannot efficiently surface their own tasks, and is not yet visible alongside AI agents in the org structure.

The closest analogues are:
- **Linear** — "My Issues" personal workspace with 4 tabs (assigned, created, subscribed, activity); fast, keyboard-driven
- **Asana AI Teammates** — humans and AI agents appear as co-equal team members, both assignable, both visible in workload views
- **Wrike human-in-loop** — task routing, state transitions, and reassignment between human and AI actors

---

## Table Stakes

Features users expect. Missing = product feels incomplete or broken for human workers.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| "My Tasks" dedicated view | Any task tool (Linear, Jira, Asana, GitHub Issues) gives workers a personal workspace. Without it, a human member has no entry point. | Low | `MyIssues.tsx` exists but uses a broken filter (`!assigneeAgentId && !done`). Needs `assigneeUserId == me` logic. |
| "Assigned to me" filter in Issues list | Standard across every work tool. Users expect to narrow the global list to their work. | Low | Issues list already supports `participantAgentId`; need parity `assigneeUserId` filter. |
| Change task status | Human must be able to move a task from todo → in_progress → in_review → done. This is the core action of a worker. | Low | Backend `updateIssue` exists; frontend needs affordance in My Tasks and Issue detail for human assignees. |
| Attach files to a task | Expected for any work product. `issue_attachments` schema already exists. | Low–Med | Asset upload UI likely exists for AI runs; human needs direct attachment from detail view. |
| Create subtasks | Standard decomposition. `parent issue` already supported. | Low | UI affordance for human-initiated subtask creation in issue detail. |
| Reassign a task to an AI agent | Core bidirectional handoff — the value prop of the hybrid system. Human completes what they can, routes to AI for the rest. | Med | Assignee picker must show both humans and AI agents in the same dropdown. |
| Human member appears in assignee picker | When an owner assigns a task, humans must appear alongside AI agents. Invisible humans cannot be assigned work. | Med | Assignee picker is likely agent-only today; needs to union `company_memberships` users. |
| Human members visible in org/member list | Owners need to see who's on the team. Mixing agents and humans in the same org list is expected. | Med | `Org.tsx` and `OrgChart.tsx` are agent-only today; need human member cards. |
| Owner can invite a human by email/link | Without an invitation mechanism, humans cannot join. Invite system exists but only tested for agents. `InviteLanding.tsx` already handles "Join as human" — needs verification that it works end-to-end. | Low | `allowedJoinTypes: "human"` and `"both"` already exist in the invite schema. |
| Owner can assign tasks to human members | The delegation flow. Owner must see all members (human + AI) when assigning. | Med | Blocked by assignee picker parity above. |

---

## Differentiators

Features that set Paperclip's hybrid model apart. Not universally expected, but meaningfully valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Team workload view: human + AI side by side | Asana does this for AI teammates but it's rare in AI-first tools. An owner seeing "Alice has 3 tasks, Claude-3 has 8" in one view is uniquely powerful. | Med–High | Requires aggregating issue counts per member, then rendering a unified list or grid. |
| Bidirectional handoff: human → AI with context | When a human reassigns to an AI agent, the existing issue thread (comments, attachments, run logs) carries over automatically. No context loss. | Low (structurally free — same issue entity) | This is a Paperclip architectural advantage. Highlight it in UX. |
| Human "inbox" filtered to actionable tasks only | Show only todo/in_progress tasks (not backlog/done) by default in My Tasks. Reduces cognitive load. | Low | Trivial filter addition in My Tasks. |
| "Assigned by me" / delegation history for owners | Owners who assign tasks want to see what they've delegated and what's stuck. | Med | Requires a query: issues where `createdByUserId == me` or assignee was set by me. Deferred to v2. |
| Human profile / display name in comments and activity | If humans leave comments or change status, those actions show "Alice changed status to In Review" rather than an agent name. Auditability. | Med | Requires `actor` attribution in issue activity log for user principals. |
| Owner-managed invite links (revoke, set expiry, restrict to human-only) | Gives owners control without needing per-person email. Invite link already supports `allowedJoinTypes`. Surface this in UI. | Low–Med | Backend likely supports it; needs UI exposure in CompanySettings. |

---

## Anti-Features

Features to explicitly NOT build for the human-agent MVP.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Email/push notifications | Adds backend complexity (email service, push infra), GDPR surface area, and was explicitly scoped out. Human workers check the app proactively. | Web-only "My Tasks" view. Make the view compelling enough that workers come to it. |
| Chat / in-task messaging | Paperclip is a task execution system, not a communication platform. Adding chat competes with Slack, adds real-time complexity, and distracts from the core model. | Use issue comments (already exist) for asynchronous context. |
| Time tracking | High complexity, low differentiation. Most human-AI hybrids don't track time. | Track by status transitions and created/updated timestamps if needed later. |
| Granular roles (admin, editor, viewer, etc.) | Premature complexity. Owner + member covers the v1 use case. Role explosion leads to permission bugs and confused UX. | Use `membershipRole: "owner"` and `"member"` only. |
| Separate "human task" entity | Would break the unified human ↔ AI handoff model. Keeping one `issues` entity for both humans and AI agents is the architectural advantage. | Reuse issues. Add `assigneeUserId` filter logic where needed. |
| Mobile app | Web-first is correct for v1. Mobile requires a separate build target, responsive design audit, and native push infra. | Responsive web UI that works on mobile browsers if needed, but no dedicated app. |
| SLA enforcement / escalation rules | Enterprise workflow orchestration feature. Wrike and Camunda offer this — Paperclip is not there yet. | Manual reassignment by owner when tasks are stuck. |
| Approval workflows for human task completion | Adds a review-gate step before marking done. Paperclip already has an `Approvals` system for AI runs; do not conflate with human task sign-off. | Human marks done; owner reviews via normal issue view. |

---

## Feature Dependencies

Dependencies flow from foundational to derived:

```
Invite flow works for humans (existing, needs verification)
  └── Human joins company as member
        └── Human appears in member/org listing
              └── Human appears in assignee picker (human + AI unified)
                    └── Owner can assign task to human
                    └── Human can reassign task to AI agent (bidirectional handoff)

Human is authenticated (better-auth, existing)
  └── "My Tasks" view filters by current user ID (assigneeUserId == me)
        └── Human can change task status from My Tasks
        └── Human can attach files from My Tasks / Issue detail
        └── Human can create subtasks from Issue detail

My Tasks + assignee picker both work
  └── Team workload view (owner sees human + AI tasks side by side)
```

---

## MVP Recommendation

Build in this order — each group unblocks the next.

**Group 1 — Make assignment work (table stakes blocker)**
1. Verify invite flow works end-to-end for human join (InviteLanding → approval → active member)
2. Add human members to assignee picker (union users + agents in the dropdown)
3. Fix `MyIssues.tsx` filter to use `assigneeUserId == currentUserId`

**Group 2 — Give humans a working workspace**
4. Status change affordance for human assignees in My Tasks and Issue detail
5. "Assigned to me" filter in the main Issues list
6. File attachment from Issue detail (if not already accessible to humans)
7. Subtask creation from Issue detail (if not already accessible to humans)

**Group 3 — Visibility for owners**
8. Human members visible in Org / member list
9. Surface invite link creation in CompanySettings (owner workflow)

**Defer:**
- Team workload view (human + AI side by side): valuable but more complex; defer to milestone 2
- Assigned-by-me / delegation history: v2
- Activity log attribution for human actors: v2

---

## Sources

- Linear "My Issues" view: [How to Use Linear's My Issues View](https://www.storylane.io/tutorials/how-to-use-linears-my-issues-view)
- Asana AI Teammates human-AI parity model: [Asana AI Teammates](https://asana.com/product/ai/ai-teammates)
- Orkes HITL workflow features: [Human-in-the-Loop in Agentic Workflows](https://orkes.io/blog/human-in-the-loop/)
- 2026 shift from "in the loop" to "above the loop": [Diginomica](https://diginomica.com/2026-year-move-human-in-loop-to-humans-above-loop)
- Agent handoff patterns: [How Agent Handoffs Work](https://towardsdatascience.com/how-agent-handoffs-work-in-multi-agent-systems/)
- Wrike human-AI collaboration: [Wrike AI Agents](https://help.wrike.com/hc/en-us/articles/30647541856146-AI-Agents-in-Wrike)
- Invite UX best practices: [Designing an intuitive user flow for inviting teammates](https://pageflows.com/resources/invite-teammates-user-flow/)
- Codebase: `ui/src/pages/MyIssues.tsx`, `ui/src/pages/InviteLanding.tsx`, `ui/src/pages/Org.tsx`, `ui/src/pages/OrgChart.tsx`, `packages/db/src/schema/issues.ts`, `packages/db/src/schema/company_memberships.ts`
