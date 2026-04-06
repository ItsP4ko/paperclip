# Phase 17: Frontend / XSS Hardening — Research

**Researched:** 2026-04-06
**Domain:** Content Security Policy (vercel.json), DOMPurify, React inline HTML sanitization
**Confidence:** HIGH

---

## Summary

Phase 17 has three requirements: CSP-01 (deploy `Content-Security-Policy-Report-Only` in vercel.json), CSP-02 (promote to enforcing after 48-72h clean observation), and CSP-03 (DOMPurify on all `dangerouslySetInnerHTML` sites). The codebase audit reveals exactly one `dangerouslySetInnerHTML` call in `ui/src/components/MarkdownBody.tsx:79`, used to inject Mermaid-rendered SVG. DOMPurify is not yet installed in the UI package.

The most important CSP directive challenge is the inline `<script>` block in `ui/index.html` (the theme-detection script). This is a static, never-changing script, so a SHA-256 hash can be used in `script-src` instead of `'unsafe-inline'`. Mermaid SVG output contains inline `style=` attributes, which means `style-src 'unsafe-inline'` is required for Mermaid to render correctly. The Tailwind v4 production build uses an external CSS file — it does NOT inject inline styles.

The CSP header is deployed via the `"headers"` array in the root `vercel.json` file.

**Primary recommendation:** Add `"headers"` to root `vercel.json` with a `Content-Security-Policy-Report-Only` header; install `dompurify @types/dompurify` in the UI package; wrap the single Mermaid SVG `dangerouslySetInnerHTML` with `DOMPurify.sanitize()`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CSP-01 | `Content-Security-Policy-Report-Only` deployed in `vercel.json` covering the SPA | Vercel `headers` array syntax confirmed; report-only directive string derived from codebase audit |
| CSP-02 | CSP promoted to enforcing after 48-72h clean observation window | Planner must specify manual promotion step; no automation needed — just change the header key |
| CSP-03 | `dompurify` installed in UI package and applied at all `dangerouslySetInnerHTML` sites | Exactly one site found: `MarkdownBody.tsx:79`; DOMPurify 3.3.3 confirmed safe for SVG |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dompurify | 3.3.3 | Sanitize SVG/HTML before `dangerouslySetInnerHTML` | Industry-standard XSS sanitizer; handles SVG/MathML; cure53-maintained |
| @types/dompurify | 3.2.0 | TypeScript types for dompurify | Official DefinitelyTyped package |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vercel.json headers | — | Deliver CSP as HTTP response header | Required for static SPA on Vercel; no server-side middleware available |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dompurify (browser-only) | isomorphic-dompurify | isomorphic adds jsdom dependency unnecessarily — UI is browser-only. STATE.md explicitly: "do NOT use isomorphic-dompurify" |
| SHA-256 hash for inline script | nonce | Nonces require server-side rendering to inject per-request. Vercel static SPA has no SSR — hash is the correct approach |
| style-src 'unsafe-inline' | style-src hash per Mermaid element | Mermaid generates hundreds of inline style attributes dynamically — per-hash approach is infeasible. 'unsafe-inline' is the only practical option for Mermaid SVG |

**Installation (UI package):**
```bash
cd ui && npm install dompurify @types/dompurify
```

**Version verification (confirmed 2026-04-06):**
- `dompurify`: 3.3.3 (latest stable — "Vocalion" release)
- `@types/dompurify`: 3.2.0

---

## Architecture Patterns

### Recommended vercel.json Structure

The root `vercel.json` already configures `buildCommand`, `outputDirectory`, `framework`, and `routes`. The `"headers"` array must be added alongside those properties.

```json
{
  "buildCommand": "pnpm --filter @paperclipai/ui build",
  "outputDirectory": "ui/dist",
  "framework": "vite",
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy-Report-Only",
          "value": "..."
        }
      ]
    }
  ]
}
```

**Source:** Official Vercel docs — https://vercel.com/docs/project-configuration/vercel-json#headers

### CSP Directive Construction (Report-Only Phase)

**Derived from codebase audit — each directive justified below:**

```
default-src 'self';
script-src 'self' 'sha256-DBObfhsqKTQuFDHP5TJPKYUs76B8eG7yiBHiko5neM8=';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://paperclip-paperclip-api.qiwa34.easypanel.host wss://paperclip-paperclip-api.qiwa34.easypanel.host;
worker-src blob:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

**Directive justification:**

| Directive | Value | Reason |
|-----------|-------|--------|
| `script-src` | `'self' 'sha256-...'` | Hash covers the theme-detection inline script in `index.html`. All other scripts are ES modules from `'self'`. `'unsafe-inline'` MUST NOT appear. |
| `style-src` | `'self' 'unsafe-inline'` | Mermaid SVG output contains many dynamic inline `style=` attributes in the injected SVG markup. Tailwind v4 production builds to an external `.css` file (no inline styles from Tailwind). `'unsafe-inline'` is required solely for Mermaid SVG. |
| `img-src` | `'self' data: blob:` | `data:image/svg+xml` is used by `mention-chips.ts` for CSS custom properties passed via React `style={}` props (CSS mask-image). `blob:` for potential future attachment previews. |
| `connect-src` | `'self' https://...api... wss://...api...` | Frontend calls `VITE_API_URL = https://paperclip-paperclip-api.qiwa34.easypanel.host`; WebSocket connects via `wss://` to the same host. |
| `worker-src` | `blob:` | Service worker (`sw.js`) registered from `blob:` in some browsers; safe to include. |
| `frame-ancestors` | `'none'` | Clickjacking protection; app has no iframe use cases. |
| `base-uri` | `'self'` | Prevents base tag injection attacks. |
| `form-action` | `'self'` | No third-party form submissions. |

**The SHA-256 hash** for the inline theme-detection script in `ui/index.html`:
```
sha256-DBObfhsqKTQuFDHP5TJPKYUs76B8eG7yiBHiko5neM8=
```
Verified by computing `sha256(script_inner_text)` against the exact content in `ui/index.html`.

### CSP-02 Promotion Pattern

Promoting from report-only to enforcing is a one-line change in `vercel.json`:

```diff
- "key": "Content-Security-Policy-Report-Only",
+ "key": "Content-Security-Policy",
```

The planner should structure CSP-01 and CSP-02 as two tasks separated by a manual observation gate (not automated).

### DOMPurify Usage Pattern (CSP-03)

The single `dangerouslySetInnerHTML` in `MarkdownBody.tsx` renders Mermaid-generated SVG:

```typescript
// Source: DOMPurify official docs — https://github.com/cure53/DOMPurify
import DOMPurify from "dompurify";

// Current (unsafe):
<div dangerouslySetInnerHTML={{ __html: svg }} />

// After (safe):
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />
```

**Configuration note:** `USE_PROFILES: { svg: true, svgFilters: true }` preserves SVG elements and filters needed for Mermaid output while stripping `<script>`, `on*` handlers, and unsafe `href` patterns. Using the default profile strips too many SVG elements and breaks Mermaid diagrams.

The requirement states: "the DOMPurify call is visible in the source, not abstracted away." Do not wrap it in a helper function.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML/SVG sanitization | Custom SVG element allowlist | DOMPurify with SVG profile | DOMPurify handles namespace confusion, mXSS, prototype pollution, DOM clobbering — each is a subtle attack vector |
| Inline script allowlisting | unsafe-inline in script-src | SHA-256 hash | unsafe-inline defeats the entire purpose of script-src |
| CSP reporting endpoint | Custom Express route | Browser console observation (report-only) | Phase 17 uses the browser DevTools as the observation tool; a report endpoint can be added in a future phase |

**Key insight:** SHA-256 hashes in `script-src` are correct for static SPAs. Nonces require per-request server-side injection, which is unavailable in a Vercel static deployment.

---

## Common Pitfalls

### Pitfall 1: Breaking the Theme Script with a Wrong Hash
**What goes wrong:** If the inline script content in `index.html` is modified (e.g., whitespace change, branding update), the SHA-256 hash becomes invalid, CSP blocks the script in enforcing mode, and the page loads with the wrong theme.
**Why it happens:** Hash is content-addressed; any byte change invalidates it.
**How to avoid:** Treat the inline script as "frozen" for the duration of this phase. Document the hash alongside the script. If the script changes, recompute the hash.
**Warning signs:** CSP violation reports showing `'sha256-...'` mismatch in `script-src`.

### Pitfall 2: style-src Without unsafe-inline Breaks Mermaid
**What goes wrong:** Mermaid generates SVG with many `style="..."` attributes. Without `'unsafe-inline'` in `style-src`, browsers block Mermaid diagram rendering in enforcing mode.
**Why it happens:** Mermaid's SVG renderer injects inline styles for colors, fonts, and layout.
**How to avoid:** `style-src 'self' 'unsafe-inline'` is correct and intentional for this app. Document this in a code comment in `vercel.json`.
**Warning signs:** Mermaid diagrams render as blank or unstyled in report-only mode (check browser console for `style-src` violations).

### Pitfall 3: Missing wss:// in connect-src
**What goes wrong:** `connect-src` allows `https://` but WebSocket upgrades use `wss://`. Both must be listed explicitly — they are different schemes.
**Why it happens:** Developers assume `https://` covers WebSocket upgrades; it does not.
**How to avoid:** Always pair `https://host` with `wss://host` in `connect-src`.
**Warning signs:** Live-updates WebSocket connection blocked; real-time updates stop working.

### Pitfall 4: DOMPurify Default Profile Strips SVG Elements
**What goes wrong:** `DOMPurify.sanitize(svg)` with no config strips most SVG-specific elements and attributes, breaking Mermaid diagrams.
**Why it happens:** DOMPurify defaults to HTML profile; SVG elements like `<g>`, `<path>`, `<defs>` are treated as unknown.
**How to avoid:** Use `{ USE_PROFILES: { svg: true, svgFilters: true } }` config.
**Warning signs:** Mermaid diagrams render as empty `<div>` after DOMPurify is applied.

### Pitfall 5: routes vs headers in vercel.json
**What goes wrong:** The existing `vercel.json` uses `"routes"` for SPA fallback. Vercel warns that `"routes"` and `"headers"` at top level can conflict.
**Why it happens:** The `"routes"` key is a legacy Vercel config; the newer approach uses `"rewrites"` + `"headers"`. However, the current project uses `"routes"` successfully.
**How to avoid:** Per Vercel docs, `"headers"` at the top level is processed before routing. Adding a `"headers"` array alongside `"routes"` is valid and supported. Verify by checking `vercel dev` output or the Vercel deployment preview.
**Warning signs:** Headers not appearing in responses despite being in vercel.json.

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### vercel.json Headers Array (official Vercel syntax)
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy-Report-Only",
          "value": "default-src 'self'; script-src 'self' 'sha256-DBObfhsqKTQuFDHP5TJPKYUs76B8eG7yiBHiko5neM8='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://paperclip-paperclip-api.qiwa34.easypanel.host wss://paperclip-paperclip-api.qiwa34.easypanel.host; worker-src blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
        }
      ]
    }
  ]
}
```
Source: https://vercel.com/docs/project-configuration/vercel-json#headers

### DOMPurify Install
```bash
cd ui && npm install dompurify @types/dompurify
```

### DOMPurify Sanitize SVG in MarkdownBody.tsx
```typescript
// At file top — add after existing imports:
import DOMPurify from "dompurify";

// In MermaidDiagramBlock component — line 79:
// Before:
<div dangerouslySetInnerHTML={{ __html: svg }} />

// After:
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />
```
Source: DOMPurify — https://github.com/cure53/DOMPurify

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `style-src 'unsafe-inline'` globally | `style-src 'self' 'unsafe-inline'` with scoped justification | Ongoing | 'self' restricts external stylesheets; 'unsafe-inline' still needed for Mermaid SVG |
| report-uri (CSP1) | report-to + report-uri (CSP3) | CSP Level 3 | `report-to` is newer but browser support varies; omit for simplicity in Phase 17 |
| isomorphic-dompurify | dompurify (browser-only) | — | isomorphic adds jsdom dependency; unnecessary for browser-only UI |

**Deprecated/outdated:**
- `X-XSS-Protection: 1; mode=block` — deprecated in modern browsers; not needed alongside CSP
- `Content-Security-Policy: sandbox` — too restrictive for SPA (blocks localStorage, etc.)

---

## Open Questions

1. **Does mermaid v11.12.3 require `'unsafe-eval'` when bundled with Vite?**
   - What we know: The existing code uses `securityLevel: "strict"` (not "sandbox" or "loose"). Mermaid's `securityLevel: "strict"` prevents user diagram content from injecting scripts but does not affect whether the library itself uses `eval()`. The lodash-es dependency historically used `Function("return this")`, which requires `'unsafe-eval'`, but this was for browser-extension contexts. In a standard bundled Vite production build, tree-shaking and bundler transforms typically eliminate this code path.
   - What's unclear: Whether the installed mermaid@11.12.3 build triggers `eval()` in a standard browser context under a strict CSP without `'unsafe-eval'`.
   - Recommendation: **Do not add `'unsafe-eval'` to the initial report-only CSP.** During the 48-72h observation window, any `'unsafe-eval'` violation from Mermaid will surface as a CSP report. If violations appear, add `'unsafe-eval'` to `script-src` before promoting to enforcing. This is exactly what the report-only observation phase is designed to catch.

2. **Service worker (`sw.js`) — does it need `worker-src`?**
   - What we know: `ui/src/main.tsx` registers `/sw.js` via `navigator.serviceWorker.register('/sw.js')`. The SW file is at `ui/dist/sw.js` (same-origin).
   - What's unclear: Whether `worker-src 'self'` is needed or if `default-src 'self'` covers it.
   - Recommendation: Explicitly include `worker-src 'self'` — it overrides `default-src` for workers and is safer to be explicit.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.5 |
| Config file | `ui/vitest.config.ts` |
| Quick run command | `cd ui && npx vitest run src/components/MarkdownBody.test.tsx` |
| Full suite command | `cd ui && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CSP-01 | vercel.json headers array present with CSP-RO key | manual | N/A — visual verification of deployed response header | N/A |
| CSP-02 | CSP promotes to enforcing; no violations for app flows | manual / time-gated | N/A — 48-72h observation window | N/A |
| CSP-03 | DOMPurify.sanitize() wraps Mermaid SVG before dangerouslySetInnerHTML | unit | `cd ui && npx vitest run src/components/MarkdownBody.test.tsx` | ✅ (test file exists, needs DOMPurify test case) |

### Sampling Rate
- **Per task commit:** `cd ui && npx vitest run src/components/MarkdownBody.test.tsx`
- **Per wave merge:** `cd ui && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `ui/src/components/MarkdownBody.test.tsx` — add test case verifying DOMPurify is called (covers CSP-03). Existing file needs one new test.

---

## Codebase Audit: dangerouslySetInnerHTML Sites

Full audit performed via `grep -rn "dangerouslySetInnerHTML" ui/src/`:

| File | Line | Content | DOMPurify needed? |
|------|------|---------|-------------------|
| `ui/src/components/MarkdownBody.tsx` | 79 | `<div dangerouslySetInnerHTML={{ __html: svg }} />` | YES — Mermaid SVG from `mermaid.render()` |

**Result: exactly one site.** No other `dangerouslySetInnerHTML` usages found in the UI codebase.

---

## Sources

### Primary (HIGH confidence)
- Vercel docs https://vercel.com/docs/project-configuration/vercel-json#headers — headers array syntax verified
- Vercel docs https://vercel.com/docs/headers/security-headers — CSP best practices
- DOMPurify https://github.com/cure53/DOMPurify — SVG profile configuration
- Project codebase — `ui/src/components/MarkdownBody.tsx`, `ui/index.html`, `vercel.json`, deploy state memory

### Secondary (MEDIUM confidence)
- MDN https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy — directive semantics
- Tailwind discussion https://github.com/tailwindlabs/tailwindcss/discussions/13326 — confirms production Vite build uses external CSS (no unsafe-inline needed for Tailwind)
- Mermaid GitHub issue #5378 — confirms mermaid dependencies historically used Function() but primarily affects browser extensions, not bundled web apps

### Tertiary (LOW confidence — flag for validation during observation window)
- Whether mermaid@11.12.3 triggers `'unsafe-eval'` in production Vite bundle — unverified, to be confirmed by CSP report-only observation

---

## Metadata

**Confidence breakdown:**
- Standard stack (DOMPurify install): HIGH — confirmed npm registry version, confirmed single usage site via codebase grep
- Architecture (vercel.json syntax): HIGH — confirmed from official Vercel docs
- CSP directive values: HIGH for most directives; MEDIUM for mermaid eval question (flagged as open question)
- Pitfalls: HIGH — derived from codebase analysis + official CSP semantics

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable domain; Vercel config schema rarely changes)
