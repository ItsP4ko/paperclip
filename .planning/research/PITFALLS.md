# Domain Pitfalls: Human Agent Support in an AI Orchestration Platform

**Domain:** Hybrid human-AI task management — adding human agents to Paperclip
**Researched:** 2026-04-03
**Overall Confidence:** HIGH (most pitfalls verified directly against this codebase)

---

## Critical Pitfalls

Mistakes in this tier cause rewrites, silent data bugs, or break existing AI agent behavior.

---

### Pitfall 1: Triggering Agent Wakeups on Human-Assigned Issues

**What goes wrong:** The issue update route fires `heartbeat.wakeup()` when `assigneeAgentId` changes and the status is not `backlog`. If a human reassigns an issue to themselves from an AI agent, the `assigneeChanged` flag is `true` but `issue.assigneeAgentId` will be `null` at that point — so the wakeup is correctly skipped. However, the reverse — a human reassigning *back to an AI* — correctly fires the wakeup. The danger is in partial updates: sending `assigneeUserId` without explicitly nulling `assigneeAgentId`. The service enforces that both cannot coexist (`"Issue can only have one assignee"`) but the client must send the right shape or get a 422 that confuses the user.

**Why it happens:** The existing code was built for AI-only assignment. Human-facing UI will construct update payloads differently. A "Reassign to AI" button that only sets `assigneeAgentId` without clearing `assigneeUserId` will be rejected silently in some code paths.

**Consequences:** 422 errors surfaced to the human user with no helpful message, or ghost assignments where the old user assignment lingers.

**Prevention:** Build a single `setAssignee(agentId | userId | null)` utility on the client that always sends both fields — one with the new value and one explicitly `null`. Never send a partial assignee update.

**Detection warning signs:** 422 errors when clicking "Assign to agent" from the human task view. Issues that appear assigned to both a user and an agent in the UI.

**Phase:** Reassignment UI (human → AI handoff flow).

---

### Pitfall 2: The MyIssues Filter Uses the Wrong Predicate

**What goes wrong:** The existing `MyIssues.tsx` page filters by `!i.assigneeAgentId` (not assigned to any agent) rather than `i.assigneeUserId === currentUserId`. This means it shows every unassigned issue in the company as belonging to the current user. When human agents are fully operational with real `assigneeUserId` values, a user will see all of the company's unassigned AI-destined issues mixed into their personal task list.

**Why it happens:** The page was built as a placeholder before human assignment was live. The filter approximates "mine" as "not an AI's."

**Consequences:** Human task list is polluted with hundreds of AI-bound issues. This is a trust-breaking UX failure — the first thing a human agent sees is noise.

**Prevention:** The `GET /issues?assigneeUserId=me` endpoint already exists and requires board authentication. Use it. Do not filter client-side on `assigneeAgentId`.

**Detection warning signs:** On a company with many AI-assigned issues, any human member sees all of them in "My Issues."

**Phase:** "My Tasks" dashboard — must fix before any human is onboarded.

---

### Pitfall 3: Sidebar Badge Count Ignores Human Task Attention

**What goes wrong:** `sidebar-badges.ts` counts `failedRuns + alertsCount + joinRequestCount + approvals` for the inbox badge. A human user with 5 assigned tasks does not generate any badge count. There is no "tasks assigned to you" signal in the navigation.

**Why it happens:** Badges were designed for owner/operator notifications (failed runs, cost alerts, approvals). Human workers need a different attention model — "I have work to do."

**Consequences:** Human members open the app and see zero badge counts, assume they have nothing to do, miss assigned tasks. This defeats the value proposition of the "My Tasks" dashboard.

**Prevention:** Add a `myTasks` count to the badges endpoint keyed on the authenticated user's `assigneeUserId`. Compute it conditionally — only when `req.actor.type === "board"` and a userId is present. This avoids any performance cost for AI agent actors.

**Detection warning signs:** Human tester says "I didn't know I had tasks." Badge always shows 0 for human members.

**Phase:** Navigation / sidebar — same phase as "My Tasks" dashboard.

---

### Pitfall 4: Org Chart Shows Agents Only, Breaks With Human Members

**What goes wrong:** `Org.tsx` queries `agentsApi.org()` — an endpoint that returns only AI agents. Human members have no concept of a reporting hierarchy, no `status` (active/paused/error), and no detail page to link to. Rendering humans in the existing `OrgTreeNode` would show them with an agent status dot and link to `/agents/{id}` which 404s.

**Why it happens:** The org chart was purpose-built for agent hierarchies. Human members are a new principal type.

**Consequences:** If humans are naively added to the org endpoint, they appear with broken status indicators and dead links. If they are excluded, the org chart is incomplete and confusing for owners managing mixed teams.

**Prevention:** Implement a separate "Team" or "Members" view for human members rather than cramming them into the agent org chart. Keep the org chart AI-only. Cross-link from agent pages to human member pages at the company level, not hierarchically.

**Detection warning signs:** Human member appears in org chart with a grey dot and clicks to a 404.

**Phase:** Members / team view.

---

### Pitfall 5: CheckoutRunId Is Cleared on Reassignment — Silent Interruption of AI Work

**What goes wrong:** `issues.ts` (`updateIssue`) explicitly sets `checkoutRunId = null` when the assignee changes. This is correct for AI-to-AI handoff but has a subtlety: if an owner reassigns an `in_progress` AI-assigned issue to a human while the AI is actively running, the checkout lock is cleared. The AI's next heartbeat check will find it no longer holds the checkout and self-interrupt. The AI run is cancelled, but the human now owns an issue that was mid-execution with partial state.

**Why it happens:** This is intentional design for AI-to-AI reassignment but was not designed with human takeover in mind.

**Consequences:** Partial AI work is abandoned silently. The human inherits an issue with no context about what the AI already did. If the AI committed files but did not complete, the human may duplicate or undo that work.

**Prevention:** Before reassigning an in-progress AI issue to a human, the UI must: (1) show a warning that the AI run will be interrupted, (2) on confirm, fetch the run's activity log or last checkpoint and surface it as a context note on the issue. Do not hide the interruption.

**Detection warning signs:** Human says "the task showed as in_progress but nothing was done." AI run shows as cancelled in activity log right after reassignment.

**Phase:** Human → AI reassignment flow and any "take over task" UI.

---

### Pitfall 6: Human Status Changes Do Not Trigger the Same Wakeup Logic

**What goes wrong:** The wakeup logic in `issues.ts` only wakes an AI agent when `assigneeAgentId` is set. A human changing their own task from `todo` to `in_progress` generates no side-effect signal to any other system component. This is correct behavior for human work. However, when a human marks a task `done`, there is no automation that can pick up downstream work — unlike AI completion which can chain tasks.

**Why it happens:** The system treats human completion as a terminal state with no downstream signal path. Fine for MVP, but causes confusion when users expect the platform to "do something" after they complete a task.

**Consequences:** Users expect that marking a task done will trigger the next step in a workflow. Nothing happens. They report the integration as broken.

**Prevention:** Make this explicit in the UI: human tasks are manual-only. No automation triggers on human task completion in v1. Document this as an intentional limitation, not a bug. Reserve a `completion_trigger` field for a future phase.

**Detection warning signs:** User asks "why didn't the next task get created when I marked this done?"

**Phase:** Status change UX — add clear labeling. Future phases can add human-completion triggers.

---

## Moderate Pitfalls

Mistakes that cause rework or UX degradation but not data corruption.

---

### Pitfall 7: Human Member Display Name / Identity

**What goes wrong:** The codebase uses `agentName()` to resolve the name to show in the Kanban board, command palette, and comment thread assignee fields. There is no equivalent `userName()` helper. Issues with `assigneeUserId` set will render as blank or an ID fragment in every component that was not explicitly updated.

**Prevention:** Audit every component that renders `assigneeAgentId` and check whether it also handles `assigneeUserId`. Build a `resolveAssigneeName(issue)` helper that checks both fields before the first human is assigned anywhere. Do this audit before shipping, not after.

**Phase:** Any UI phase that touches the issue card or issue detail.

---

### Pitfall 8: Rate Limiting Gap on Invite Acceptance

**What goes wrong:** CONCERNS.md documents that there is no HTTP-level rate limiting on the Express API. Invite acceptance (`/access` routes) uses token-based flows with only 41 bits of entropy. For an MVP with 10 human members this is acceptable. If human membership scales to hundreds of users and invites are publicly linked, brute-force on invite tokens becomes a real risk.

**Prevention:** This does not block the human agent MVP. Address in a hardening phase after MVP. Note in the access route: `COMPANY_INVITE_TTL_MS` is already 10 minutes — keep it. Increase token length from 8 to 16 characters when adding bulk invite support.

**Phase:** Security hardening (post-MVP).

---

### Pitfall 9: Human Members Appear as Assignable But Cannot Receive Wakeups

**What goes wrong:** The "assign to" dropdown must distinguish between AI agents (can be woken, run autonomously) and human members (passive, must log in to see work). If a human is shown alongside AI agents in the same assignee picker with no visual distinction, owners will accidentally assign tasks to humans thinking they will be worked automatically.

**Why it happens:** The `assertAssignableUser` validation only checks membership. It does not and should not prevent assignment — but the UI has no affordance to signal the difference.

**Prevention:** In all assignee picker components (`NewIssueDialog`, `CommandPalette`, `IssueDetail`), group humans and agents into distinct sections with a label ("Team Members" / "AI Agents") or a human icon. Never mix them in a flat list.

**Phase:** Assignee picker UI update — needed before any human can be assigned.

---

### Pitfall 10: Context Loss on Human → AI Handoff

**What goes wrong:** When a human reassigns a task to an AI agent, the AI receives only the issue description and comments. It has no structured representation of what the human did, what decisions were made, or what was left incomplete. The AI may redo work, contradict decisions, or ask for context the human already provided in informal conversation.

**Why it happens:** The issue model stores comments but there is no structured "handoff summary" concept. Free-text context in comments is noisy for AI consumption.

**Prevention:** When a human uses the "Reassign to AI" flow, prompt them for a brief handoff note (optional in v1, structured in v2). Store it as a comment tagged with `type: "handoff_note"` so AI agents can prioritize it in their context window. Do not make this required for MVP — a text comment is sufficient.

**Phase:** Human → AI reassignment dialog.

---

## Minor Pitfalls

---

### Pitfall 11: Invitation Flow Already Exists — Do Not Rebuild It

**What goes wrong:** The invite/join system already works (`server/src/routes/access.ts`, `company_memberships` with `principalType: "user"`). Teams building this milestone often re-examine the invite flow and are tempted to redesign it "properly for human agents." This creates scope creep and risks breaking existing agent hire flows that share the same code path.

**Prevention:** Reuse the existing invite system. The only missing piece is owner-facing UI to send invites (not a new backend flow). Audit `requestType === "human"` in the access route — this path already exists.

**Phase:** Invite UI only. Touch the backend only to fix bugs, not to redesign.

---

### Pitfall 12: No Polling / Push for Human Task Updates

**What goes wrong:** Human members have no notification mechanism in v1 (explicitly out of scope in PROJECT.md). This means a human who is assigned a task while logged in will not see it until they navigate to "My Tasks." If the TanStack Query cache TTL is long, they may not see it for minutes.

**Prevention:** Set `staleTime: 0` and `refetchInterval: 30_000` on the "My Tasks" query. This gives near-real-time updates without a full WebSocket infrastructure. This is intentionally simple — proper push notifications are deferred.

**Phase:** "My Tasks" dashboard implementation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| "My Tasks" dashboard | Wrong filter predicate (Pitfall 2), missing badge count (Pitfall 3) | Use `assigneeUserId=me` API endpoint; add badge count before ship |
| Assignee picker UI | Mixed human/AI in flat list (Pitfall 9), missing `userName()` helper (Pitfall 7) | Group by type; build resolver helper first |
| Human → AI reassignment | Dual-assignee 422 (Pitfall 1), AI run interruption with no warning (Pitfall 5) | Use atomic setAssignee utility; show interruption warning |
| AI → human reassignment | Context loss for the human (Pitfall 10) | Prompt for handoff note; surface AI activity log |
| Org chart / team view | Agent-only data model (Pitfall 4) | Keep org chart AI-only; build separate Members page |
| Status change UX | Human completion has no downstream trigger (Pitfall 6) | Label explicitly; defer automation to future phase |
| Invite flow | Scope creep rebuilding what already works (Pitfall 11) | UI only; do not touch backend invite logic |
| Post-MVP hardening | Invite token entropy, no HTTP rate limiting (Pitfall 8) | Increase token length; add express-rate-limit |

---

## Sources

- Codebase direct analysis: `server/src/routes/issues.ts` (wakeup logic, checkout clearing on reassignment), `server/src/services/issues.ts` (dual-assignee guard, `assertAssignableUser`), `ui/src/pages/MyIssues.tsx` (wrong filter predicate), `ui/src/components/KanbanBoard.tsx` (agent-only name rendering), `server/src/routes/sidebar-badges.ts` (badge count composition), `.planning/codebase/CONCERNS.md` (rate limiting gap, invite entropy)
- [Common Failure Modes of Human-AI Collaboration](https://skillseek.eu/answers/common-failure-modes-of-human-ai-collaboration) — MEDIUM confidence
- [Agent Orchestration: Human-in-the-Loop Design](https://orkes.io/blog/human-in-the-loop/) — MEDIUM confidence (verified against codebase patterns)
- [AI Agent Handoff: Why Context Breaks](https://xtrace.ai/blog/ai-agent-context-handoff) — MEDIUM confidence
- [Access Control for Multi-Tenant AI Agents](https://www.scalekit.com/blog/access-control-multi-tenant-ai-agents) — MEDIUM confidence
- [Human-in-the-Loop for AI Agents: Best Practices](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo) — MEDIUM confidence
