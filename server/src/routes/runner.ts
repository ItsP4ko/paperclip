import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { logger } from "../middleware/logger.js";
import { heartbeatService } from "../services/index.js";
import { assertBoard } from "./authz.js";
import { forbidden } from "../errors.js";
import { subscribeCompanyLiveEvents, subscribeGlobalLiveEvents } from "../services/live-events.js";

const logSchema = z.object({
  stream: z.enum(["stdout", "stderr"]),
  chunk: z.string(),
});

const completeSchema = z.object({
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  timedOut: z.boolean(),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  resultJson: z.record(z.unknown()).nullable().optional(),
});

export function runnerRoutes(db: Db) {
  const router = Router();
  const heartbeat = heartbeatService(db);

  /** Resolve accessible company IDs for the current actor. Instance admins get all. */
  async function resolveCompanyIds(companyIds: string[] | undefined, isAdmin: boolean): Promise<string[]> {
    if (!isAdmin) return companyIds ?? [];
    if ((companyIds ?? []).length > 0) return companyIds!;
    // Instance admin with no explicit companies — fetch all distinct company IDs
    const rows = await db.selectDistinct({ companyId: agents.companyId }).from(agents);
    return rows.map((r) => r.companyId);
  }

  /**
   * GET /runner/jobs
   * List pending_local runs scoped to the actor's accessible companies.
   */
  router.get("/runner/jobs", async (req, res) => {
    assertBoard(req);
    const isAdmin = !!(req.actor.isInstanceAdmin || req.actor.source === "local_implicit");
    const companyIds = await resolveCompanyIds(req.actor.companyIds, isAdmin);
    const jobs = await heartbeat.listPendingLocalRuns(companyIds);
    res.json(jobs);
  });

  /**
   * POST /runner/jobs/:runId/claim
   * Atomically claim a pending_local run → running.
   */
  router.post("/runner/jobs/:runId/claim", async (req, res) => {
    assertBoard(req);
    const runId = req.params.runId as string;
    const isAdmin = !!(req.actor.isInstanceAdmin || req.actor.source === "local_implicit");

    const result = await heartbeat.claimLocalRun(runId);

    if (!isAdmin) {
      const allowed = req.actor.companyIds ?? [];
      if (!allowed.includes(result.run.companyId)) {
        logger.warn({ runId, companyId: result.run.companyId }, "[runner] claim rejected — actor lacks company access");
        throw forbidden("Run does not belong to an accessible company");
      }
    }

    res.json({ run: result.run, agent: result.agent });
  });

  /**
   * POST /runner/jobs/:runId/log
   * Append a stdout/stderr chunk from the local runner.
   */
  router.post("/runner/jobs/:runId/log", validate(logSchema), async (req, res) => {
    assertBoard(req);
    const runId = req.params.runId as string;
    const { stream, chunk } = req.body as z.infer<typeof logSchema>;
    await heartbeat.appendLocalRunLog(runId, stream, chunk);
    res.json({ ok: true });
  });

  /**
   * POST /runner/jobs/:runId/complete
   * Finalize a run with the result from the local runner.
   */
  router.post("/runner/jobs/:runId/complete", validate(completeSchema), async (req, res) => {
    assertBoard(req);
    const runId = req.params.runId as string;
    const result = req.body as z.infer<typeof completeSchema>;
    const finalizedRun = await heartbeat.completeLocalRun(runId, result);
    res.json({ run: finalizedRun });
  });

  /**
   * GET /runner/jobs/stream
   * SSE endpoint — pushes full pending_local job list whenever a new run.jobs.pending event fires.
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

    // Send current jobs immediately on connect (so runner picks up any that arrived before connecting)
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

    if (isAdmin && companyIds.length === 0) {
      // Instance admin with no explicit companies — subscribe to global events
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

  return router;
}
