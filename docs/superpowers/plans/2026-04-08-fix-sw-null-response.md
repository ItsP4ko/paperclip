# Service Worker Null Response Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `sw.js` so `respondWith()` never receives a null-resolving Promise, eliminating the Safari error "FetchEvent.respondWith received an error: Returned response is null."

**Architecture:** The service worker catch block has two bugs: (1) `caches.match("/") || fallback` evaluates the `||` against a Promise object (always truthy), making the fallback unreachable; (2) `caches.match(request)` can resolve to `undefined` when the request isn't cached. Both cases feed a null value into `respondWith()`. The fix wraps both `caches.match()` calls in `.then(cached => cached || fallback)` so the resolved value is always a valid Response.

**Tech Stack:** Vanilla Service Worker API (no build step — `sw.js` lives in `ui/public/` and is served as-is)

---

## File Map

| Action | Path |
|--------|------|
| Modify | `ui/public/sw.js` (main repo) |
| Modify | `.claude/worktrees/remote-control/ui/public/sw.js` (worktree — active branch) |

Both files are identical; fix both in the same commit.

---

### Task 1: Fix the catch block in `sw.js`

**Files:**
- Modify: `ui/public/sw.js` (lines 35-40)

**Root cause:**

```javascript
// BEFORE — broken
.catch(() => {
  if (request.mode === "navigate") {
    // caches.match() returns a Promise — always truthy — so || is dead code
    return caches.match("/") || new Response("Offline", { status: 503 });
  }
  // Resolves to undefined when request not cached → null to respondWith
  return caches.match(request);
})
```

- [ ] **Step 1: Apply the fix**

Replace the `catch` block with:

```javascript
.catch(() => {
  const key = request.mode === "navigate" ? "/" : request;
  return caches
    .match(key)
    .then((cached) => cached || new Response("Offline", { status: 503 }));
})
```

Full corrected `sw.js`:

```javascript
const CACHE_NAME = "relaycontrol-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and API calls
  if (request.method !== "GET" || url.pathname.startsWith("/api")) {
    return;
  }

  // Network-first for everything — cache is only an offline fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        const key = request.mode === "navigate" ? "/" : request;
        return caches
          .match(key)
          .then((cached) => cached || new Response("Offline", { status: 503 }));
      })
  );
});
```

- [ ] **Step 2: Apply the same fix to the worktree copy**

The worktree at `.claude/worktrees/remote-control/ui/public/sw.js` is identical — apply the exact same change.

- [ ] **Step 3: Verify no other `respondWith` calls exist**

```bash
grep -r "respondWith\|caches\.match" ui/public/sw.js
```

Expected: Only the one `respondWith` call and the two `caches.match` references inside the new `.then()`.

- [ ] **Step 4: Commit**

```bash
git add ui/public/sw.js
git commit -m "fix(sw): ensure respondWith never receives null — wrap caches.match in .then fallback"
```

---

## Testing

**Manual test (Safari mobile via Tailscale):**
1. Deploy or reload the app at `paco.tail32ac59.ts.net`
2. Open Safari DevTools (or check Safari Web Inspector from Mac)
3. Disable network on device (Airplane mode) and reload
4. Expected: "Offline" page (503) instead of the Safari error modal

**Manual test (Chrome DevTools):**
1. Open DevTools → Application → Service Workers
2. Check "Offline" checkbox
3. Reload page
4. Expected: Response with status 503, no console errors about null

**Smoke test (no offline):**
1. Load app normally — all routes should work as before
2. No change in behaviour when network is available
