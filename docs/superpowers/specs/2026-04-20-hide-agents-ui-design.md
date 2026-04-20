# Hide Agents from UI — Design

**Date:** 2026-04-20
**Branch:** `feature/hide-agents-ui`
**Target:** `developer`

## Goal

Hide all agent-related surfaces from the Paperclip web and desktop UI without
deleting underlying data, backend endpoints, or the components themselves. The
change must be fully reversible by re-adding the removed entry points.

## Non-goals

- Removing `/api/agents/*` routes or agent business logic in the server.
- Dropping agent tables or mutating database state.
- Deleting reusable components (`AgentIcon`, `AgentIconPicker`, `AgentProperties`,
  `NewAgentDialog`, `ActiveAgentsPanel`, `AgentConfigForm`, `SidebarAgents`).
  These remain on disk in case other code imports them or we want to re-enable.

## Changes

### Navigation

| File | Change |
|---|---|
| `ui/src/components/Sidebar.tsx` | Remove the `<SidebarAgents />` render + its import. |
| `ui/src/components/MobileBottomNav.tsx` | Remove any agent nav item. |
| `ui/src/App.tsx` | Remove all `/agents/*` routes (authenticated + unprefixed redirects) and the lazy imports for `Agents`, `AgentDetail`, `NewAgent`. |

### Panels / widgets

| File | Change |
|---|---|
| `ui/src/pages/Dashboard.tsx` | Remove the "Add Agent" / onboarding CTA tied to agent creation. Remove `<ActiveAgentsPanel />` usage. |
| `ui/src/components/OnboardingWizard.tsx` | Skip the "create agent" step (or remove it from the wizard entirely). |

### Command palette

| File | Change |
|---|---|
| `ui/src/components/CommandPalette.tsx` | Remove "Agents" group entry, "Create new agent" command, and the `agent` entry in the entity-prefix map. Adjust placeholder copy. |

### Detail pages

| File | Change |
|---|---|
| `ui/src/components/IssueProperties.tsx` | Hide the "assigned agent" row. |
| `ui/src/components/GoalProperties.tsx` | Hide the "assigned agent" row. |

### Dialog context

`DialogContext.openNewAgent` stays as a no-op-accessible function since
`NewAgentDialog` still exists. No callers should remain after the changes above;
if any non-UI consumer references it, leave it intact.

## Risk / rollback

- **Risk:** removing routes means deep links to `/agents/...` 404. Acceptable —
  they are intentionally hidden.
- **Rollback:** revert this feature branch; underlying components and APIs
  untouched.

## Verification

1. `pnpm --filter ui build` succeeds.
2. `pnpm --filter ui tsc --noEmit` clean.
3. Manual smoke: sidebar no longer shows agents block, `/agents` URL renders
   404/NotFound, command palette search for "agent" returns no entries,
   Dashboard empty state does not mention agents, issue/goal detail pages do
   not show agent rows.

## Out of scope (tracked separately)

- Groups page UI tweak (members count label + project name) — separate branch.
