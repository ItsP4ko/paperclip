# Phase 11: Backend Deploy Gaps - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Get the live Easypanel backend up to date with the current codebase: commit all pending changes (including the Pipelines migration), redeploy, fix sidebar navigation for the three new routes, and re-verify E2E critical paths for phases 3, 4, and 5.

</domain>

<decisions>
## Implementation Decisions

### Sidebar routing fix
- Add missing `UnprefixedBoardRedirect` entries in `App.tsx` for the three new routes: `knowledge`, `cost-recommendations`, `pipelines`, `pipelines/:pipelineId`, `pipelines/:pipelineId/runs/:runId`
- Do NOT change existing sidebar links or switch to relative/dynamic paths — the current pattern (absolute paths + redirect) works for all other routes and should be extended consistently
- A 3–5 line change in the `UnprefixedBoardRedirect` block (lines ~341–364 of `App.tsx`)

### Route verification after deploy
- Plan includes concrete `curl` commands against the live Easypanel base URL for each new route (`/api/companies/:id/knowledge`, `/api/companies/:id/cost-recommendations`, `/api/companies/:id/pipelines`)
- Pass = non-404 response (any auth-gated 401/403 also counts as registered)
- Commands provided as copy-paste blocks in the plan's acceptance criteria

### E2E re-verification scope
- Critical-path smoke test only — no full Playwright re-run required
- Phase 3 check: Owner can see full team list including human members
- Phase 4 check: Invite → join → task assign flow completes end-to-end
- Phase 5 check: Cross-origin auth cookie persists across page navigation (Vercel frontend → Easypanel backend)
- Steps documented as manual browser checklist in the plan — human executes

### Deploy sequence
- **Step 1**: Plan displays the full SQL from `0051_multi_agent_pipelines.sql` for manual execution on Supabase before any code deploy
- **Step 2**: After migration confirmed, commit all pending changes in one atomic commit (schema + routes + UI + planning docs)
- **Step 3**: Trigger Easypanel redeploy (git push → Easypanel picks up new commit)

### Claude's Discretion
- Exact curl flags/auth header format for route verification
- Order of UnprefixedBoardRedirect entries (append after existing entries)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and success criteria
- `.planning/ROADMAP.md` — Phase 11 goal and success criteria (3 concrete checks)
- `.planning/REQUIREMENTS.md` — DEPLOY-01, DEPLOY-02, DEPLOY-03 requirement definitions

### Prior E2E results (baseline for re-verification)
- `.planning/milestones/v1.1-phases/07-end-to-end-verification/07-VERIFICATION.md` — What passed/failed in Phase 7; the E2E-01 through E2E-05 results are the baseline to re-verify

### Key source files to modify
- `ui/src/App.tsx` lines 341–364 — `UnprefixedBoardRedirect` block; new route entries go here
- `server/src/app.ts` lines 201–203 — Confirms knowledgeRoutes, costRecommendationRoutes, pipelineRoutes already mounted (no backend code change needed)
- `server/src/routes/index.ts` — Confirms pipelineRoutes already exported (no change needed)

### Migration to show user
- `packages/db/src/migrations/0051_multi_agent_pipelines.sql` — Must be displayed and manually confirmed before deploy

### Project constraints
- `.planning/PROJECT.md` — No automatic migrations; SQL shown to user first

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `UnprefixedBoardRedirect` (App.tsx:273) — handles absolute-path sidebar links; read it to understand the pattern before extending
- `SidebarNavItem` (ui/src/components/SidebarNavItem.tsx) — no change needed; fix is entirely in App.tsx redirect entries
- `.planning/milestones/v1.1-phases/07-end-to-end-verification/e2e-verify.ts` — existing Playwright script (not re-run in this phase, but useful reference for critical paths)

### Established Patterns
- All sidebar links use absolute paths (e.g., `to="/dashboard"`) — backed by UnprefixedBoardRedirect entries; new routes need matching entries
- Backend route mounting: import route factory in `app.ts`, call with `db`, mount with `api.use()`
- Easypanel deploy: git push to `master` triggers rebuild automatically

### Integration Points
- `ui/src/App.tsx` UnprefixedBoardRedirect block (root-level routes before `/:companyPrefix`) — where the fix lands
- `packages/db/src/migrations/` — migration file already exists; just needs to be run on Supabase
- New pages already in working tree: `ui/src/pages/Pipelines.tsx`, `PipelineDetail.tsx`, `PipelineRunDetail.tsx`

</code_context>

<specifics>
## Specific Ideas

- Curl verification example: `curl -I https://<easypanel-backend>/api/companies/<cid>/knowledge` — expect 200, 401, or 403, NOT 404
- E2E smoke test should reference the same screenshots dir pattern as Phase 7 for continuity

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-backend-deploy-gaps*
*Context gathered: 2026-04-05*
