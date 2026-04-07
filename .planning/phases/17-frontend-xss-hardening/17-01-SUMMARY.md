---
phase: 17-frontend-xss-hardening
plan: 01
subsystem: ui/security
tags: [csp, dompurify, xss, mermaid, vercel]
dependency_graph:
  requires: []
  provides: [CSP-Report-Only header in vercel.json, DOMPurify sanitization in MarkdownBody]
  affects: [ui/src/components/MarkdownBody.tsx, vercel.json]
tech_stack:
  added: [dompurify@^3.3.2]
  patterns: [inline DOMPurify.sanitize with SVG profile, CSP-Report-Only via Vercel headers]
key_files:
  created: []
  modified:
    - ui/src/components/MarkdownBody.tsx
    - ui/src/components/MarkdownBody.test.tsx
    - ui/package.json
    - pnpm-lock.yaml
    - vercel.json
decisions:
  - "@types/dompurify moved to devDependencies since dompurify@3.3.2 ships its own TypeScript types"
  - "SHA-256 hash sha256-2oMWziIOZ3clEgoBlgQGv6iO60JrWMqbpz+42WnDniA= verified against exact inline script bytes in ui/index.html"
  - "Source-assertion test pattern used for DOMPurify test (SSR renderToStaticMarkup does not fire useEffect)"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  files_modified: 5
---

# Phase 17 Plan 01: CSP Report-Only Header and DOMPurify Mermaid Sanitization Summary

DOMPurify SVG sanitization applied inline at the single Mermaid dangerouslySetInnerHTML site, and Content-Security-Policy-Report-Only header deployed to all Vercel routes with verified SHA-256 hash for the theme-detection inline script.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Install DOMPurify, sanitize Mermaid SVG, add test | 665e77ec | ui/package.json, ui/src/components/MarkdownBody.tsx, ui/src/components/MarkdownBody.test.tsx, pnpm-lock.yaml |
| 2 | Add CSP-Report-Only header to vercel.json | ded4d721 | vercel.json |

## What Was Built

### Task 1: DOMPurify Mermaid SVG Sanitization

- Installed `dompurify@^3.3.2` as a production dependency in the `ui` package
- Added `import DOMPurify from "dompurify"` to `MarkdownBody.tsx`
- Replaced the bare `dangerouslySetInnerHTML={{ __html: svg }}` with `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })` inline in the `MermaidDiagramBlock` component
- Added a unit test using the source-assertion pattern (reading the file via `fs.readFileSync`) since `renderToStaticMarkup` does not fire `useEffect` in SSR, so the async mermaid render never executes
- Moved `@types/dompurify` to `devDependencies` since dompurify 3.x ships its own TypeScript declaration files

### Task 2: CSP-Report-Only Header

- Added `"headers"` array to `vercel.json` matching all routes `/(.*)`
- CSP directive includes:
  - `script-src 'self' 'sha256-2oMWziIOZ3clEgoBlgQGv6iO60JrWMqbpz+42WnDniA='` — hash verified against exact inline script bytes in `ui/index.html`
  - `style-src 'self' 'unsafe-inline'` — required for Mermaid SVG inline styles and shadcn/ui animated components
  - `img-src 'self' data: blob:` — covers SVG data URIs and blob download links
  - `font-src 'self' data:` — covers bundled fonts
  - `connect-src 'self' https://... wss://...` — both schemes for Easypanel VPS API and WebSocket
  - `worker-src 'self'` — for service worker at /sw.js
  - `frame-ancestors 'none'` — clickjacking protection
  - `base-uri 'self'; form-action 'self'` — injection prevention
  - No `unsafe-eval` anywhere in the policy

## Verification Results

1. `cd ui && npx vitest run src/components/MarkdownBody.test.tsx` — 4 tests pass including DOMPurify test
2. CSP-Report-Only header present in vercel.json with correct SHA-256 hash and all required directives
3. `grep -c 'DOMPurify.sanitize' ui/src/components/MarkdownBody.tsx` returns 1
4. `grep -c 'dangerouslySetInnerHTML' ui/src/components/MarkdownBody.tsx` returns 1 (still one site, now wrapped)
5. Full UI test suite: 197 tests pass across 41 test files — no regressions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] @types/dompurify moved to devDependencies**
- **Found during:** Task 1 — pnpm installed @types/dompurify into dependencies
- **Issue:** `@types/dompurify` is a TypeScript type package and belongs in devDependencies; dompurify 3.x ships its own types anyway making it optional
- **Fix:** Manually moved `@types/dompurify` from `dependencies` to `devDependencies` in `ui/package.json`
- **Files modified:** `ui/package.json`
- **Commit:** 665e77ec

**2. [Rule 3 - Blocking] pnpm not on PATH — used corepack cache**
- **Found during:** Task 1 install step
- **Issue:** `pnpm` not available on PATH; monorepo requires pnpm for workspace installs
- **Fix:** Located pnpm binary at `/Users/pacosemino/.cache/node/corepack/v1/pnpm/9.15.4/bin/pnpm.cjs` and invoked via `node` directly
- **Files modified:** none (infrastructure resolution)

## Decisions Made

- `@types/dompurify` placed in `devDependencies` — it is a build-time types-only package; dompurify 3.x ships own types
- SHA-256 hash `sha256-2oMWziIOZ3clEgoBlgQGv6iO60JrWMqbpz+42WnDniA=` verified by computing `sha256(bytes_between_script_tags_inclusive_of_surrounding_newlines)` — matches plan spec exactly
- Source-assertion test pattern chosen over mock-based mermaid test because `renderToStaticMarkup` does not trigger `useEffect`, so the async mermaid render path is unreachable in the node test environment

## Self-Check: PASSED

- ui/src/components/MarkdownBody.tsx — FOUND
- ui/src/components/MarkdownBody.test.tsx — FOUND
- vercel.json — FOUND
- ui/package.json — FOUND
- .planning/phases/17-frontend-xss-hardening/17-01-SUMMARY.md — FOUND
- Commit 665e77ec (Task 1) — FOUND
- Commit ded4d721 (Task 2) — FOUND
