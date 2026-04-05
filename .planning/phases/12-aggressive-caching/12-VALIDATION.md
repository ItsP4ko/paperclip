---
phase: 12
slug: aggressive-caching
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (root `vitest.config.ts` aggregates `ui` project) |
| **Config file** | `ui/vitest.config.ts` |
| **Quick run command** | `pnpm --filter ui test --run` |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter ui test --run`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 0 | CACHE-01 | unit | `pnpm --filter ui test --run Issues` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 0 | CACHE-02 | unit | `pnpm --filter ui test --run IssueDetail` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 0 | CACHE-03 | unit | `pnpm --filter ui test --run LiveUpdatesProvider` | ✅ (new case) | ⬜ pending |
| 12-01-04 | 01 | 0 | CACHE-04 | unit | `pnpm --filter ui test --run IssueDetail` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 1 | CACHE-01 | unit | `pnpm --filter ui test --run Issues` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 1 | CACHE-01 | unit | `pnpm --filter ui test --run MyIssues` | ✅ (extend) | ⬜ pending |
| 12-02-03 | 02 | 1 | CACHE-02 | unit | `pnpm --filter ui test --run IssueDetail` | ❌ W0 | ⬜ pending |
| 12-02-04 | 02 | 1 | CACHE-03 | unit | `pnpm --filter ui test --run LiveUpdatesProvider` | ✅ (new case) | ⬜ pending |
| 12-02-05 | 02 | 1 | CACHE-04 | unit | `pnpm --filter ui test --run IssueDetail` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `ui/src/pages/Issues.test.tsx` — unit test asserting `staleTime: 120_000` on `queryKeys.issues.list` query (CACHE-01)
- [ ] `ui/src/pages/IssueDetail.test.tsx` — unit tests asserting `staleTime: 120_000` on detail query (CACHE-02) and `listAssignedToMe` in `invalidateIssue()` (CACHE-04)
- [ ] New test case in `ui/src/context/LiveUpdatesProvider.test.ts` — assert `listAssignedToMe` is invalidated on `activity.logged` WS event with `entityType === "issue"` (CACHE-03)

*Note: `ui/src/pages/MyIssues.test.tsx` already exists — extend to assert `staleTime: 120_000` on the `listAssignedToMe` useQuery call.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Back-navigation shows data instantly (< 100ms) | CACHE-01 | Visual timing check | Navigate to Issues list → open an issue → press Back → data must appear without spinner |
| Reopening issue detail is instant | CACHE-02 | Visual timing check | Open issue → navigate away → return within 2 min → no skeleton screen |
| My Tasks badge count matches list | CACHE-03 | Requires WS event + live state | Note sidebar badge count → open My Tasks → list length must match badge |
| No stale values after mutation | CACHE-04 | Requires actual mutation flow | Change issue status → verify list and detail both reflect the new status |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
