import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterRuntimeServiceReport,
} from "@paperclipai/adapter-utils";
import { asString, asNumber, parseObject } from "@paperclipai/adapter-utils/server-utils";
import {
  connectOrCreateSandbox,
  ensureCliInstalled,
  runCommandInSandbox,
} from "./sandbox-client.js";
import { buildTargetCommand } from "./target-commands.js";

function resolveE2BApiKey(config: Record<string, unknown>, authToken?: string): string {
  const explicit = asString(config.e2bApiKey, "");
  if (explicit) return explicit;
  const envConfig = parseObject(config.env);
  const fromEnv = asString(envConfig.E2B_API_KEY, "");
  if (fromEnv) return fromEnv;
  if (authToken) return authToken;
  throw new Error("No E2B API key configured. Set e2bApiKey in adapter config or provide E2B_API_KEY in env.");
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta } = ctx;
  const targetAdapterType = asString(config.targetAdapterType, "claude_local");
  const timeoutSec = asNumber(config.timeoutSec, 300);
  const projectId = asString(context.projectId, agent.companyId);

  // Suppress unused warning — runId is used implicitly via ctx passed to buildTargetCommand
  void runId;

  let apiKey: string;
  try {
    apiKey = resolveE2BApiKey(config, ctx.authToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: msg,
      errorCode: "e2b_no_api_key",
    };
  }

  // 1. Resolve sandbox ID from context or session params
  const runtimeSessionParams = parseObject(ctx.runtime.sessionParams);
  const sandboxId =
    asString(context.sandboxId, "") ||
    asString(runtimeSessionParams.sandboxId, "");

  await onLog("stdout", `[paperclip] E2B sandbox: ${sandboxId ? `resuming ${sandboxId}` : "creating new sandbox"}\n`);

  let sandbox;
  try {
    sandbox = await connectOrCreateSandbox({
      apiKey,
      sandboxId: sandboxId || undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isExpiredSandbox = msg.includes("not found") || msg.includes("expired");

    if (sandboxId && isExpiredSandbox) {
      await onLog("stdout", `[paperclip] Sandbox "${sandboxId}" expired, creating fresh sandbox\n`);
      try {
        sandbox = await connectOrCreateSandbox({ apiKey });
      } catch (retryErr) {
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          errorMessage: `Failed to create E2B sandbox: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
          errorCode: "e2b_sandbox_create_failed",
          clearSession: true,
        };
      }
    } else {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Failed to connect to E2B sandbox: ${msg}`,
        errorCode: "e2b_sandbox_connect_failed",
      };
    }
  }

  const activeSandboxId = sandbox.sandboxId;
  await onLog("stdout", `[paperclip] E2B sandbox active: ${activeSandboxId}\n`);

  // 2. Ensure target CLI is installed
  try {
    await onLog("stdout", `[paperclip] Ensuring ${targetAdapterType} CLI is installed...\n`);
    await ensureCliInstalled(sandbox, targetAdapterType);
  } catch (err) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Failed to install CLI in sandbox: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: "e2b_cli_install_failed",
      sessionParams: { sandboxId: activeSandboxId },
      sessionDisplayId: activeSandboxId,
      runtimeServices: [buildServiceReport(activeSandboxId, agent.companyId, projectId, "failed")],
    };
  }

  // 3. Build the target CLI command
  const target = buildTargetCommand(targetAdapterType, ctx);

  if (onMeta) {
    await onMeta({
      adapterType: "e2b_sandbox",
      command: target.binary,
      cwd: target.cwd,
      commandArgs: target.args,
      env: {},
      prompt: target.prompt,
      context,
    });
  }

  // 4. Run command inside sandbox
  const fullCommand = buildShellCommand(target.binary, target.args, target.prompt);

  let result;
  try {
    result = await runCommandInSandbox(sandbox, {
      command: fullCommand,
      envs: target.env,
      cwd: target.cwd,
      timeoutMs: timeoutSec * 1000,
      onStdout: (data) => { onLog("stdout", data); },
      onStderr: (data) => { onLog("stderr", data); },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = msg.toLowerCase().includes("timeout");
    return {
      exitCode: null,
      signal: null,
      timedOut,
      errorMessage: timedOut ? `Timed out after ${timeoutSec}s` : `Sandbox execution error: ${msg}`,
      errorCode: timedOut ? "timeout" : "e2b_execution_error",
      sessionParams: { sandboxId: activeSandboxId },
      sessionDisplayId: activeSandboxId,
      runtimeServices: [buildServiceReport(activeSandboxId, agent.companyId, projectId, "running")],
    };
  }

  // 5. Keep sandbox alive for the configured idle period
  try {
    await sandbox.setTimeout(15 * 60 * 1000); // 15 minutes
  } catch {
    // Non-fatal — sandbox may still be kept alive by E2B defaults
  }

  // 6. Return result
  return {
    exitCode: result.exitCode,
    signal: null,
    timedOut: false,
    errorMessage: result.exitCode !== 0
      ? `${target.binary} exited with code ${result.exitCode}`
      : null,
    provider: "e2b",
    biller: "e2b",
    billingType: "metered_api",
    sessionParams: { sandboxId: activeSandboxId },
    sessionDisplayId: activeSandboxId,
    resultJson: {
      stdout: result.stdout.slice(-10_000),
      stderr: result.stderr.slice(-5_000),
      targetAdapterType,
    },
    runtimeServices: [buildServiceReport(activeSandboxId, agent.companyId, projectId, "running")],
  };
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function buildShellCommand(binary: string, args: string[], prompt: string): string {
  const escapedArgs = args.map(shellEscape).join(" ");
  const escapedPrompt = shellEscape(prompt);
  return `echo ${escapedPrompt} | ${shellEscape(binary)} ${escapedArgs}`;
}

function buildServiceReport(
  sandboxId: string,
  companyId: string,
  projectId: string,
  status: "starting" | "running" | "stopped" | "failed",
): AdapterRuntimeServiceReport {
  return {
    serviceName: "e2b_sandbox",
    lifecycle: "shared",
    reuseKey: `${companyId}:${projectId}`,
    providerRef: sandboxId,
    status,
    stopPolicy: {
      sleepAfterIdleMinutes: 15,
      destroyAfterDaysSleeping: 7,
      destroyAfterDaysNoRuns: 10,
    },
  };
}
