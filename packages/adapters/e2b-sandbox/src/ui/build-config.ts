import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildE2BSandboxAdapterConfig(
  values: CreateConfigValues,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    targetAdapterType: (values as unknown as Record<string, unknown>).targetAdapterType ?? "claude_local",
    model: values.model || "",
    promptTemplate: values.promptTemplate || "",
    cwd: values.cwd || "/workspace",
    timeoutSec: 300,
    maxTurnsPerRun: values.maxTurnsPerRun || 0,
    dangerouslySkipPermissions: true,
  };

  const extra = values as unknown as Record<string, unknown>;
  const sandboxPlan = extra.sandboxPlan ?? "managed";
  config.sandboxPlan = sandboxPlan;

  if (sandboxPlan === "byok" && typeof extra.e2bApiKey === "string" && extra.e2bApiKey.trim()) {
    config.e2bApiKey = extra.e2bApiKey.trim();
  }

  if (values.extraArgs?.trim()) {
    config.extraArgs = values.extraArgs.split(/\s+/).filter(Boolean);
  }

  if (values.envVars?.trim()) {
    const env: Record<string, string> = {};
    for (const line of values.envVars.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }
    config.env = env;
  }

  return config;
}
