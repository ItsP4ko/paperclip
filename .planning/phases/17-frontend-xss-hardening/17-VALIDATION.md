---
phase: 17
slug: frontend-xss-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing in ui/) |
| **Config file** | `ui/vite.config.ts` |
| **Quick run command** | `cd ui && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd ui && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd ui && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd ui && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | CSP-03 | unit | `cd ui && npx vitest run --reporter=verbose` | ✅ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | CSP-01 | manual | Browser DevTools CSP check | N/A | ⬜ pending |
| 17-02-01 | 02 | 2 | CSP-02 | manual | 48-72h observation window | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `ui/src/components/__tests__/MarkdownBody.test.tsx` — unit test for DOMPurify sanitization on dangerouslySetInnerHTML output (CSP-03)
- [ ] `ui/src/test/setup.ts` — jsdom setup with DOMPurify mock if needed

*If framework not installed: `cd ui && npm install dompurify @types/dompurify`*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSP-Report-Only header on every HTML response | CSP-01 | Requires deployed Vercel app + browser DevTools | Deploy, open Network tab, verify `Content-Security-Policy-Report-Only` header present on HTML responses |
| Zero violation reports after 48-72h | CSP-01/CSP-02 gate | Time-gated observation window | Monitor browser console for CSP violation reports over 48-72h of normal usage |
| CSP enforcing header promotion | CSP-02 | Requires observation window completion | After clean window, deploy enforcing header; verify shadcn/ui, Mermaid, WebSocket still work |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
