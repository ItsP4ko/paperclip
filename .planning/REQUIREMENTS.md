# Requirements: Human Agents for Paperclip

**Defined:** 2026-04-03
**Core Value:** Un humano puede recibir, trabajar y completar tareas dentro de Paperclip exactamente como lo hace un agente de IA — sin fricción, desde la web app.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Identity & Membership

- [x] **IDENT-01**: Owner can invite human users to the company via email/link from CompanySettings
- [x] **IDENT-02**: Invited human can join the company through the invite landing page
- [x] **IDENT-03**: Human members appear in a members/team list within the company
- [x] **IDENT-04**: Backend returns human member display name and email (join auth_users in members API)

### My Tasks

- [x] **TASKS-01**: Human user sees a dedicated "My Tasks" dashboard with issues assigned to them
- [x] **TASKS-02**: MyIssues filter correctly uses `assigneeUserId=me` (fix existing bug)
- [x] **TASKS-03**: "Assigned to me" filter available in the main Issues list view
- [x] **TASKS-04**: Sidebar badge count reflects number of tasks assigned to the human user
- [x] **TASKS-05**: My Tasks page is accessible from the main navigation sidebar

### Task Actions

- [x] **ACTN-01**: Human can change the status of their assigned tasks (todo/in_progress/in_review/done)
- [x] **ACTN-02**: Human can attach files to their assigned tasks
- [x] **ACTN-03**: Human can create subtasks within their assigned tasks
- [x] **ACTN-04**: Human can reassign a task to an AI agent (bidirectional handoff)
- [x] **ACTN-05**: Reassignment sends both assigneeAgentId and assigneeUserId atomically (prevent 422)

### Assignment

- [ ] **ASGN-01**: Owner can assign tasks to human members from issue creation/detail
- [ ] **ASGN-02**: Assignee picker shows humans and AI agents in separate grouped sections
- [x] **ASGN-03**: UI warns when reassigning an in-progress AI task to a human (run interruption)

### Permissions

- [x] **PERM-01**: Human member can only mutate issues assigned to them (unless owner)
- [x] **PERM-02**: Owner can edit/assign any issue in the company

### Team Visibility

- [ ] **TEAM-01**: Human members visible in a dedicated "Team Members" section (separate from AI org chart)
- [ ] **TEAM-02**: Owner can see workload summary per member (human + AI) — open issue counts

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTF-01**: Human receives email notification when assigned a task
- **NOTF-02**: Human receives in-app notification for task assignments and status changes
- **NOTF-03**: Human can configure notification preferences

### Activity Attribution

- **ATTR-01**: Activity log shows human actor name for status changes and actions
- **ATTR-02**: "Assigned by me" / delegation history for owners

### Advanced Team

- **ADVT-01**: Automation triggers on human task completion (e.g., auto-assign follow-up to AI)
- **ADVT-02**: Team workload dashboard with charts and trends
- **ADVT-03**: Role-based permissions beyond owner/member (admin, viewer, etc.)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Email/push notifications | MVP is web-app-only; user enters and checks proactively |
| Chat/messaging between members | Not a communication tool |
| Time tracking | Unnecessary complexity for v1 |
| Mobile app | Web-first approach |
| Separate task entity for humans | Reuse existing issues system — unified task model |
| Human agents in AI org chart tree | Would break status dots and dead links; use separate section |
| OAuth/SSO beyond better-auth | Current auth is sufficient for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDENT-01 | Phase 1 | Complete |
| IDENT-02 | Phase 1 | Complete |
| IDENT-03 | Phase 3 | Complete |
| IDENT-04 | Phase 1 | Complete |
| TASKS-01 | Phase 1 | Complete |
| TASKS-02 | Phase 1 | Complete |
| TASKS-03 | Phase 2 | Complete |
| TASKS-04 | Phase 1 | Complete |
| TASKS-05 | Phase 1 | Complete |
| ACTN-01 | Phase 2 | Complete |
| ACTN-02 | Phase 2 | Complete |
| ACTN-03 | Phase 2 | Complete |
| ACTN-04 | Phase 2 | Complete |
| ACTN-05 | Phase 2 | Complete |
| ASGN-01 | Phase 3 | Pending |
| ASGN-02 | Phase 3 | Pending |
| ASGN-03 | Phase 2 | Complete |
| PERM-01 | Phase 2 | Complete |
| PERM-02 | Phase 2 | Complete |
| TEAM-01 | Phase 3 | Pending |
| TEAM-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 — roadmap created, traceability confirmed*
