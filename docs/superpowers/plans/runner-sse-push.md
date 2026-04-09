# Plan: Runner SSE Push (replace polling)

## Goal
Replace the `GET /runner/jobs` polling loop (~10 req/s) with a true SSE push architecture.
The server notifies connected runners the instant a job becomes `pending_local`.
Eliminates ~95% of DB queries when runners are idle.

## Branch
`feature/runner-sse-push` from `developer`

## Files

| File | Change |
|---|---|
| `packages/shared/src/constants.ts` | Add `"runner.jobs.pending"` to `LIVE_EVENT_TYPES` |
| `server/src/services/heartbeat.ts` | Publish `runner.jobs.pending` live event after `setRunStatus → pending_local` |
| `server/src/routes/runner.ts` | Add `GET /runner/jobs/stream` SSE endpoint |
| `cli/src/commands/runner.ts` | Replace polling loop with SSE reader + reconnect logic |

---

## Tasks

### Task 1 — Add `runner.jobs.pending` live event type
**File:** `packages/shared/src/constants.ts`

In the `LIVE_EVENT_TYPES` array (around line 324), add `"runner.jobs.pending"` after `"heartbeat.run.log"`:

```ts
export const LIVE_EVENT_TYPES = [
  "heartbeat.run.queued",
  "heartbeat.run.status",
  "heartbeat.run.event",
  "heartbeat.run.log",
  "runner.jobs.pending",   // ← NEW
  "agent.status",
  ...
] as const;
```

**Verification:** `grep -r "runner.jobs.pending" packages/shared/src/constants.ts` returns a match.

---

### Task 2 — Publish live event when run becomes `pending_local`
**File:** `server/src/services/heartbeat.ts`

Find the block at line ~2143–2148:
```ts
if (runtimeConfEarly.executionTarget === "local_runner") {
  await setRunStatus(run.id, "pending_local", {});
  logger.info({ runId: run.id, agentId: agent.id }, "[heartbeat] deferred to local runner");
  activeRunExecutions.delete(run.id);
  return;
}
```

After `setRunStatus`, add:
```ts
publishLiveEvent({
  companyId: run.companyId,
  type: "runner.jobs.pending",
  payload: { runId: run.id },
});
```

`publishLiveEvent` is already imported at the top of the file.

**Verification:** `grep -n "runner.jobs.pending" server/src/services/heartbeat.ts` returns a match.

---

### Task 3 — Add SSE endpoint `GET /runner/jobs/stream`
**File:** `server/src/routes/runner.ts`

Add the following route BEFORE the `return router` line. It needs access to `subscribeCompanyLiveEvents` and `subscribeGlobalLiveEvents` from `live-events.ts`.

Add import at top:
```ts
import { subscribeCompanyLiveEvents, subscribeGlobalLiveEvents } from "../services/live-events.js";
```

Add route:
```ts
/**
 * GET /runner/jobs/stream
 * SSE endpoint — pushes full pending_local job list whenever a new job is available.
 * Replaces the polling loop in the local runner CLI.
 */
router.get("/runner/jobs/stream", async (req, res) => {
  assertBoard(req);
  const isAdmin = !!(req.actor.isInstanceAdmin || req.actor.source === "local_implicit");
  const companyIds = await resolveCompanyIds(req.actor.companyIds, isAdmin);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(":ok\n\n");

  // Helper: fetch and push current pending jobs
  const pushJobs = async () => {
    if (!res.writable) return;
    try {
      const jobs = await heartbeat.listPendingLocalRuns(companyIds);
      res.write(`data: ${JSON.stringify(jobs)}\n\n`);
    } catch {
      // best-effort — don't crash the SSE connection on a transient DB error
    }
  };

  // Send current jobs immediately on connect
  await pushJobs();

  // Keepalive every 30s to prevent proxy/LB timeouts
  const keepaliveInterval = setInterval(() => {
    if (res.writable) res.write(":keepalive\n\n");
  }, 30_000);

  const unsubs: Array<() => void> = [];

  const handleEvent = async (event: { type: string }) => {
    if (event.type !== "runner.jobs.pending") return;
    await pushJobs();
  };

  // Subscribe to events for each accessible company
  if (isAdmin && companyIds.length === 0) {
    // Admin with no explicit companies: subscribe to global events
    unsubs.push(subscribeGlobalLiveEvents(handleEvent as Parameters<typeof subscribeGlobalLiveEvents>[0]));
  } else {
    for (const cid of companyIds) {
      unsubs.push(subscribeCompanyLiveEvents(cid, handleEvent as Parameters<typeof subscribeCompanyLiveEvents>[0]));
    }
  }

  const cleanup = () => {
    clearInterval(keepaliveInterval);
    for (const unsub of unsubs) unsub();
  };

  req.on("close", cleanup);
  res.on("error", cleanup);
});
```

**Verification:** `grep -n "runner/jobs/stream" server/src/routes/runner.ts` returns a match.

---

### Task 4 — Replace CLI polling loop with SSE reader
**File:** `cli/src/commands/runner.ts`

Replace the entire `runnerStart` function body (the `while(true)` loop and everything inside it) with an SSE-based approach.

Remove the `--poll-interval` option (or keep for backwards compat but ignore it).

New implementation:

```ts
async function runnerStart(opts: RunnerStartOptions): Promise<void> {
  const maxConcurrency = Math.max(1, Number(opts.concurrency ?? "4") || 4);
  const ctx = resolveCommandContext(opts);
  const api = ctx.api;

  console.log(pc.bold("[runner] Local runner starting — SSE push mode"));
  console.log(pc.dim(`[runner] API base: ${(api as { apiBase?: string }).apiBase ?? "(inferred)"}`));
  console.log(pc.dim(`[runner] Max concurrency: ${maxConcurrency}`));
  console.log(pc.dim("[runner] Press Ctrl+C to stop\n"));

  const inFlight = new Set<string>();
  let stopped = false;

  const shutdown = () => {
    stopped = true;
    console.log(pc.yellow("\n[runner] Shutting down..."));
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const processJobs = (jobs: RunnerJob[]) => {
    const pending = Array.isArray(jobs) ? jobs.filter((j) => !inFlight.has(j.id)) : [];
    const available = maxConcurrency - inFlight.size;
    const batch = pending.slice(0, Math.max(0, available));
    for (const job of batch) {
      inFlight.add(job.id);
      void executeJob(api, job, Boolean(opts.verbose))
        .catch((err) => {
          console.error(pc.red(`[runner] Unhandled error for run ${job.id}: ${err instanceof Error ? err.message : String(err)}`));
        })
        .finally(() => {
          inFlight.delete(job.id);
        });
    }
  };

  let backoffMs = 1_000;

  while (!stopped) {
    try {
      const url = `${(api as { apiBase?: string }).apiBase ?? ""}/api/runner/jobs/stream`;
      const headers: Record<string, string> = { accept: "text/event-stream" };
      if ((api as { apiKey?: string }).apiKey) {
        headers.authorization = `Bearer ${(api as { apiKey?: string }).apiKey}`;
      }

      const response = await fetch(url, { headers, signal: AbortSignal.timeout(90_000) });
      if (!response.ok || !response.body) {
        throw new Error(`SSE connect failed: ${response.status}`);
      }

      backoffMs = 1_000; // reset backoff on successful connect
      console.log(pc.dim("[runner] SSE stream connected"));

      const decoder = new TextDecoder();
      let buffer = "";

      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        if (stopped) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jobs = JSON.parse(line.slice(6)) as RunnerJob[];
              processJobs(jobs);
            } catch {
              // malformed data — skip
            }
          }
        }
      }

      console.log(pc.yellow("[runner] SSE stream closed, reconnecting..."));
    } catch (err) {
      if (stopped) break;
      console.error(pc.yellow(`[runner] SSE error (reconnecting in ${backoffMs}ms): ${err instanceof Error ? err.message : String(err)}`));
    }

    if (!stopped) {
      await delay(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30_000);
    }
  }
}
```

Also update the command registration to remove `--poll-interval` option (or mark as deprecated):
- Remove `.option("--poll-interval <ms>", "Poll interval in milliseconds", "3000")` line
- Remove `pollInterval?: string` from `RunnerStartOptions` interface

**Verification:** `grep -n "SSE push mode" cli/src/commands/runner.ts` returns a match.

---

## Post-implementation

- Create branch `feature/runner-sse-push` from `developer`
- Commit all changes with message: `feat(runner): replace polling with SSE push for job delivery`
- Push branch and open PR to `developer`
