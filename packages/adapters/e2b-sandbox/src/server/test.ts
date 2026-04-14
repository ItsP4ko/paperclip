import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { Sandbox } from "e2b";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = ctx.config;

  // Check 1: API key present
  const sandboxPlan = asString(config.sandboxPlan, "managed");
  const e2bApiKey = asString(config.e2bApiKey, "");
  const envConfig = parseObject(config.env);
  const envApiKey = asString(envConfig.E2B_API_KEY, "");
  const hasApiKey = e2bApiKey.length > 0 || envApiKey.length > 0;

  if (sandboxPlan === "byok" && !hasApiKey) {
    checks.push({
      code: "e2b_no_api_key",
      level: "error",
      message: "No E2B API key configured",
      hint: "Set e2bApiKey in adapter config or E2B_API_KEY in environment variables",
    });
    return { adapterType: "e2b_sandbox", status: "fail", checks, testedAt: new Date().toISOString() };
  }

  if (hasApiKey) {
    checks.push({
      code: "e2b_api_key_present",
      level: "info",
      message: "E2B API key is configured",
    });
  } else {
    checks.push({
      code: "e2b_managed_plan",
      level: "info",
      message: "Using Paperclip-managed E2B plan",
    });
  }

  // Check 2: Target adapter type valid
  const targetAdapterType = asString(config.targetAdapterType, "");
  const validTargets = ["claude_local", "codex_local", "opencode_local", "pi_local", "gemini_local"];
  if (!targetAdapterType) {
    checks.push({
      code: "e2b_no_target",
      level: "error",
      message: "No target adapter type configured",
      hint: "Set targetAdapterType to one of: " + validTargets.join(", "),
    });
  } else if (!validTargets.includes(targetAdapterType)) {
    checks.push({
      code: "e2b_invalid_target",
      level: "warn",
      message: `Unknown target adapter type: ${targetAdapterType}`,
      hint: "Known types: " + validTargets.join(", "),
    });
  } else {
    checks.push({
      code: "e2b_target_valid",
      level: "info",
      message: `Target adapter: ${targetAdapterType}`,
    });
  }

  // Check 3: Connectivity test (optional, only if API key available)
  if (hasApiKey) {
    const apiKey = e2bApiKey || envApiKey;
    try {
      const sandbox = await Sandbox.create({ apiKey, timeoutMs: 30_000 });
      await sandbox.kill();
      checks.push({
        code: "e2b_connectivity_ok",
        level: "info",
        message: "E2B sandbox connectivity verified",
      });
    } catch (err) {
      checks.push({
        code: "e2b_connectivity_failed",
        level: "error",
        message: `E2B connectivity failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check your API key and network connectivity",
      });
      return { adapterType: "e2b_sandbox", status: "fail", checks, testedAt: new Date().toISOString() };
    }
  }

  const hasError = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");
  return {
    adapterType: "e2b_sandbox",
    status: hasError ? "fail" : hasWarn ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
