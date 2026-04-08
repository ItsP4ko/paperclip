import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import type { Command } from "commander";
import pc from "picocolors";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { execute as claudeExecute } from "@paperclipai/adapter-claude-local/server";
import { execute as codexExecute } from "@paperclipai/adapter-codex-local/server";
import { execute as cursorExecute } from "@paperclipai/adapter-cursor-local/server";
import { execute as geminiExecute } from "@paperclipai/adapter-gemini-local/server";
import { execute as openCodeExecute } from "@paperclipai/adapter-opencode-local/server";
import { execute as piExecute } from "@paperclipai/adapter-pi-local/server";
import { addCommonClientOptions, handleCommandError, resolveCommandContext } from "./client/common.js";
import { PaperclipApiClient } from "../client/http.js";

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

type ExecuteFn = (ctx: AdapterExecutionContext) => Promise<AdapterExecutionResult>;

const LOCAL_EXECUTORS = new Map<string, ExecuteFn>([
  ["claude_local", claudeExecute],
  ["codex_local", codexExecute],
  ["cursor", cursorExecute],
  ["gemini_local", geminiExecute],
  ["opencode_local", openCodeExecute],
  ["pi_local", piExecute],
]);

// ---------------------------------------------------------------------------
// Types matching the server runner route responses
// ---------------------------------------------------------------------------

interface RunnerJob {
  id: string;
  companyId: string;
  agentId: string;
  agentName: string;
  agentAdapterType: string;
  agentAdapterConfig: Record<string, unknown>;
  agentRuntimeConfig: Record<string, unknown>;
  contextSnapshot: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  agentMd?: string | null;
  projectClaudeMd?: string | null;
}

interface ClaimResponse {
  run: RunnerJob;
  agent: {
    id: string;
    companyId: string;
    name: string;
    adapterType: string;
    adapterConfig: Record<string, unknown>;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveLocalWorkspacePath(agentId: string): string {
  const base = process.env.PAPERCLIP_RUNNER_WORKSPACES?.trim()
    || path.join(os.homedir(), "paperclip", "workspaces");
  return path.join(base, agentId);
}

// ---------------------------------------------------------------------------
// Job executor
// ---------------------------------------------------------------------------

async function executeJob(
  api: PaperclipApiClient,
  job: RunnerJob,
  verbose: boolean,
): Promise<void> {
  const runId = job.id;
  const adapterType = job.agentAdapterType;

  // Claim the run atomically
  let claimed: ClaimResponse | null;
  try {
    claimed = await api.post<ClaimResponse>(`/api/runner/jobs/${runId}/claim`);
  } catch (err) {
    // Another runner may have claimed it first — not an error
    if (verbose) {
      console.log(pc.yellow(`[runner] Skipping ${runId} — already claimed: ${err instanceof Error ? err.message : String(err)}`));
    }
    return;
  }
  if (!claimed) return;

  console.log(pc.cyan(`[runner] ▶ ${job.agentName} (${adapterType}) run ${runId}`));

  const executeFn = LOCAL_EXECUTORS.get(adapterType);
  if (!executeFn) {
    const msg = `Adapter '${adapterType}' is not supported for local execution`;
    console.error(pc.red(`[runner] ✗ ${msg}`));
    await api.post(`/api/runner/jobs/${runId}/complete`, {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: msg,
      errorCode: "unsupported_adapter",
    }).catch(() => undefined);
    return;
  }

  // Ensure workspace directory exists
  const workspacePath = resolveLocalWorkspacePath(job.agentId);
  try {
    await fs.mkdir(workspacePath, { recursive: true });
  } catch {
    // Non-fatal — the adapter may create its own cwd
  }

  // Build adapter config: inject workspace cwd only when agent has none configured
  const adapterConfig: Record<string, unknown> = {
    ...(typeof job.agentAdapterConfig === "object" && job.agentAdapterConfig !== null
      ? job.agentAdapterConfig
      : {}),
  };
  if (!adapterConfig.cwd) {
    adapterConfig.cwd = workspacePath;
  }

  // ── DB-stored instructions injection ──────────────────────────────────────
  // These override local filesystem files so the runner always uses the
  // company-controlled instructions from the shared DB.

  const effectiveCwd = String(adapterConfig.cwd || workspacePath);
  let tmpInstructionsDir: string | null = null;

  // 1. Agent instructions (agentMd) → temp file → override instructionsFilePath
  if (typeof job.agentMd === "string" && job.agentMd.trim().length > 0) {
    tmpInstructionsDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-agent-md-"));
    const tmpPath = path.join(tmpInstructionsDir, "AGENTS.md");
    await fs.writeFile(tmpPath, job.agentMd, "utf-8");
    adapterConfig.instructionsFilePath = tmpPath;
    if (verbose) {
      console.log(pc.dim(`[runner] DB agentMd injected via ${tmpPath}`));
    }
  }

  // 2. Project CLAUDE.md (projectClaudeMd) → write to workspace cwd
  if (typeof job.projectClaudeMd === "string" && job.projectClaudeMd.trim().length > 0) {
    await fs.mkdir(effectiveCwd, { recursive: true });
    await fs.writeFile(path.join(effectiveCwd, "CLAUDE.md"), job.projectClaudeMd, "utf-8");
    if (verbose) {
      console.log(pc.dim(`[runner] DB projectClaudeMd written to ${effectiveCwd}/CLAUDE.md`));
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const context: Record<string, unknown> = {
    ...(job.contextSnapshot ?? {}),
  };

  const onLog = async (stream: "stdout" | "stderr", chunk: string): Promise<void> => {
    await api
      .post(`/api/runner/jobs/${runId}/log`, { stream, chunk })
      .catch(() => undefined); // best-effort; don't crash on transient errors
  };

  const ctx: AdapterExecutionContext = {
    runId,
    agent: {
      id: job.agentId,
      companyId: job.companyId,
      name: job.agentName,
      adapterType,
      adapterConfig,
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config: adapterConfig,
    context,
    onLog,
  };

  let result: AdapterExecutionResult;
  try {
    result = await executeFn(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(pc.red(`[runner] ✗ Adapter exception for run ${runId}: ${message}`));
    await api
      .post(`/api/runner/jobs/${runId}/complete`, {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: message,
        errorCode: "adapter_exception",
      })
      .catch(() => undefined);
    return;
  } finally {
    if (tmpInstructionsDir) {
      await fs.rm(tmpInstructionsDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const outcome =
    result.timedOut
      ? "timed_out"
      : (result.exitCode ?? 0) === 0 && !result.errorMessage
        ? "succeeded"
        : "failed";

  const icon = outcome === "succeeded" ? "✓" : "✗";
  const colour = outcome === "succeeded" ? "green" : "red";
  console.log(pc[colour](`[runner] ${icon} Run ${runId} ${outcome} (exit ${result.exitCode ?? "null"})`));

  await api
    .post(`/api/runner/jobs/${runId}/complete`, {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage: result.errorMessage ?? null,
      errorCode: result.errorCode ?? null,
      resultJson: result.resultJson ?? null,
    })
    .catch((err) => {
      console.error(pc.yellow(`[runner] Warning: failed to report completion for ${runId}: ${err instanceof Error ? err.message : String(err)}`));
    });
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

interface RunnerStartOptions {
  config?: string;
  dataDir?: string;
  context?: string;
  profile?: string;
  apiBase?: string;
  apiKey?: string;
  json?: boolean;
  pollInterval?: string;
  concurrency?: string;
  verbose?: boolean;
}

async function runnerStart(opts: RunnerStartOptions): Promise<void> {
  const pollIntervalMs = Math.max(500, Number(opts.pollInterval ?? "3000") || 3000);
  const maxConcurrency = Math.max(1, Number(opts.concurrency ?? "4") || 4);

  const ctx = resolveCommandContext(opts);
  const api = ctx.api;

  console.log(pc.bold(`[runner] Local runner starting — polling every ${pollIntervalMs}ms`));
  console.log(pc.dim(`[runner] API base: ${(api as { apiBase?: string }).apiBase ?? "(inferred)"}`));
  console.log(pc.dim(`[runner] Max concurrency: ${maxConcurrency}`));
  console.log(pc.dim("[runner] Press Ctrl+C to stop\n"));

  const inFlight = new Set<string>();

  const shutdown = () => {
    console.log(pc.yellow("\n[runner] Shutting down..."));
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  while (true) {
    try {
      const jobs = await api.get<RunnerJob[]>("/api/runner/jobs");
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
    } catch (err) {
      console.error(pc.yellow(`[runner] Poll error: ${err instanceof Error ? err.message : String(err)}`));
    }

    await delay(pollIntervalMs);
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerRunnerCommands(program: Command): void {
  const runner = program.command("runner").description("Local agent runner — execute agents on this machine");

  addCommonClientOptions(
    runner
      .command("start")
      .description("Start the local runner and poll for pending jobs")
      .option("--poll-interval <ms>", "Poll interval in milliseconds", "3000")
      .option("--concurrency <n>", "Max number of concurrent runs", "4")
      .option("--verbose", "Print extra debug output")
      .action(async (opts: RunnerStartOptions) => {
        try {
          await runnerStart(opts);
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}
