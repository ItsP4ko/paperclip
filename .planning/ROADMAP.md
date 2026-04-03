# Roadmap: Human Agents for Paperclip

## Overview

This milestone adds human agents as first-class participants in Paperclip's existing AI task system. The work flows from identity outward: first establish that a human can join the company and see their tasks (Phase 1), then give them a functional workspace to act on those tasks (Phase 2), then give owners visibility into their mixed human-AI team (Phase 3). No schema migrations are required — the backend already stores `assigneeUserId` on issues and `principalType: "user"` in memberships. The effort is UI surfaces, a permission gate, and fixing one trust-breaking filter bug.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Identity, Membership & My Tasks Foundation** - Human can join the company and see their assigned tasks (completed 2026-04-03)
- [ ] **Phase 2: Task Work Surface** - Human can act on their tasks (status, files, subtasks, handoff to AI)
- [ ] **Phase 3: Owner Team Visibility** - Owner can see and assign to a mixed human-AI team

## Phase Details

### Phase 1: Identity, Membership & My Tasks Foundation
**Goal**: A human can receive an invite, join the company, and immediately see their assigned tasks in a working personal dashboard
**Depends on**: Nothing (first phase)
**Requirements**: IDENT-01, IDENT-02, IDENT-04, TASKS-01, TASKS-02, TASKS-04, TASKS-05
**Success Criteria** (what must be TRUE):
  1. Owner can generate an invite link from CompanySettings and share it with a human
  2. Human clicks the invite link, creates an account or signs in, and lands inside the correct company
  3. Human sees a "My Tasks" page in the sidebar navigation showing only issues assigned to them (not all unassigned AI issues)
  4. Sidebar badge next to "My Tasks" shows the current count of tasks assigned to the human
  5. Members API returns display name and email for human members (join to auth_users)
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Fix MyIssues filter bug, register /my-tasks route, add My Tasks sidebar nav item
- [ ] 01-02-PLAN.md — Extend members API with auth_users join; add human invite UI in CompanySettings
- [ ] 01-03-PLAN.md — Add myTasks badge count to sidebar-badges type, service, and route

### Phase 2: Task Work Surface
**Goal**: A human member can change task status, attach files, create subtasks, and hand off tasks to AI agents — without triggering errors or silent data loss
**Depends on**: Phase 1
**Requirements**: TASKS-03, ACTN-01, ACTN-02, ACTN-03, ACTN-04, ACTN-05, ASGN-03, PERM-01, PERM-02
**Success Criteria** (what must be TRUE):
  1. Human can change the status of an issue assigned to them directly from My Tasks and from the issue detail view
  2. Human can attach a file to their assigned issue without error
  3. Human can create a subtask inside their assigned issue
  4. Human can reassign their task to an AI agent; when the issue was in-progress with an AI run, a warning appears before confirming and the AI's prior activity is surfaced as context
  5. Human member cannot mutate issues assigned to other users; owner can mutate any issue
  6. "Assigned to me" filter toggle is available and functional in the main Issues list view
**Plans**: TBD

Plans:
- [ ] 02-01: Build `setAssignee(agentId | userId | null)` atomic client utility; add bidirectional reassignment UI with AI run interruption warning
- [ ] 02-02: Add human action bar in IssueDetail (conditional on assigneeUserId === currentUserId); verify file attachment and subtask creation work for human actors
- [ ] 02-03: Add human member permission gate in issues route (can only mutate own tasks); add "Assigned to me" filter to Issues.tsx

### Phase 3: Owner Team Visibility
**Goal**: Owner can see all human members alongside AI agents, assign tasks to any member, and get a workload summary across the full team
**Depends on**: Phase 2
**Requirements**: IDENT-03, ASGN-01, ASGN-02, TEAM-01, TEAM-02
**Success Criteria** (what must be TRUE):
  1. Human members are visible in a dedicated "Team Members" section in the org/team page (separate from the AI org chart)
  2. Assignee picker in issue creation, issue detail, and command palette shows humans and AI agents in distinct grouped sections with clear labels
  3. Owner can assign a new or existing issue to a human member from any of those surfaces
  4. Owner sees an open issue count per member (human and AI) on the team page
**Plans**: TBD

Plans:
- [ ] 03-01: Build `resolveAssigneeName(issue)` helper; extend Org.tsx with a separate "Team Members" section for humans
- [ ] 03-02: Build unified grouped assignee picker (Team Members / AI Agents) for NewIssueDialog, IssueDetail, and CommandPalette
- [ ] 03-03: Add per-member workload summary (open issue counts) to team page using issuesApi.list({ assigneeUserId })

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Identity, Membership & My Tasks Foundation | 3/3 | Complete   | 2026-04-03 |
| 2. Task Work Surface | 0/3 | Not started | - |
| 3. Owner Team Visibility | 0/3 | Not started | - |
