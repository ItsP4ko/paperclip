import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  parseObject,
  buildPaperclipEnv,
  renderTemplate,
} from "@paperclipai/adapter-utils/server-utils";
import { getCliBinary } from "./sandbox-client.js";

export interface TargetCommand {
  binary: string;
  args: string[];
  env: Record<string, string>;
  prompt: string;
  cwd: string;
}

export function buildTargetCommand(
  targetAdapterType: string,
  ctx: AdapterExecutionContext,
): TargetCommand {
  const { runId, agent, config, context } = ctx;
  const binary = asString(config.command, getCliBinary(targetAdapterType));
  const model = asString(config.model, "");
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );
  const cwd = asString(config.cwd, "/workspace");
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const maxTurns = asNumber(config.maxTurnsPerRun, 0);
  const dangerouslySkipPermissions = asBoolean(config.dangerouslySkipPermissions, true);
  const extraArgs = asStringArray(config.extraArgs);

  // timeoutSec is read above for future use (e.g. passed to sandbox run options)
  void timeoutSec;

  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId },
    context,
  };
  const prompt = renderTemplate(promptTemplate, templateData);

  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  const envConfig = parseObject(config.env);
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }

  const args = buildArgsForTarget(targetAdapterType, {
    model,
    prompt,
    maxTurns,
    dangerouslySkipPermissions,
    extraArgs,
  });

  return { binary, args, env, prompt, cwd };
}

interface ArgBuildInput {
  model: string;
  prompt: string;
  maxTurns: number;
  dangerouslySkipPermissions: boolean;
  extraArgs: string[];
}

function buildArgsForTarget(targetAdapterType: string, input: ArgBuildInput): string[] {
  switch (targetAdapterType) {
    case "claude_local":
      return buildClaudeArgs(input);
    case "codex_local":
      return buildCodexArgs(input);
    case "opencode_local":
      return buildOpenCodeArgs(input);
    case "pi_local":
      return buildPiArgs(input);
    case "gemini_local":
      return buildGeminiArgs(input);
    default:
      return buildClaudeArgs(input);
  }
}

function buildClaudeArgs(input: ArgBuildInput): string[] {
  const args = ["--print", "-", "--output-format", "stream-json", "--verbose"];
  if (input.dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
  if (input.model) args.push("--model", input.model);
  if (input.maxTurns > 0) args.push("--max-turns", String(input.maxTurns));
  args.push(...input.extraArgs);
  return args;
}

function buildCodexArgs(input: ArgBuildInput): string[] {
  const args = ["--full-auto", "--quiet"];
  if (input.model) args.push("--model", input.model);
  args.push(...input.extraArgs);
  return args;
}

function buildOpenCodeArgs(input: ArgBuildInput): string[] {
  const args = ["run", "--format", "json"];
  if (input.model) args.push("--model", input.model);
  args.push(...input.extraArgs);
  return args;
}

function buildPiArgs(input: ArgBuildInput): string[] {
  const args = ["--print", "-", "--output-format", "stream-json"];
  if (input.model) {
    const parts = input.model.split("/");
    if (parts.length === 2) {
      args.push("--provider", parts[0]!, "--model", parts[1]!);
    } else {
      args.push("--model", input.model);
    }
  }
  args.push(...input.extraArgs);
  return args;
}

function buildGeminiArgs(input: ArgBuildInput): string[] {
  const args = ["--sandbox", "--json"];
  if (input.model) args.push("--model", input.model);
  args.push(...input.extraArgs);
  return args;
}
