import { Sandbox } from "e2b";

export interface SandboxConnectionOptions {
  apiKey: string;
  sandboxId?: string;
  timeoutMs?: number;
}

export interface SandboxCommandOptions {
  command: string;
  envs?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface SandboxCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const CLI_INSTALL_COMMANDS: Record<string, string> = {
  claude_local: "npm install -g @anthropic-ai/claude-code",
  codex_local: "npm install -g @openai/codex",
  opencode_local: "npm install -g opencode",
  // pi_local and gemini_local are intentionally omitted — package names are uncertain.
  // The adapter will fail with a clear error asking the user to pre-install the CLI.
};

const CLI_BINARIES: Record<string, string> = {
  claude_local: "claude",
  codex_local: "codex",
  opencode_local: "opencode",
  pi_local: "pi",
  gemini_local: "gemini",
};

export function getCliBinary(targetAdapterType: string): string {
  return CLI_BINARIES[targetAdapterType] ?? targetAdapterType;
}

export function getCliInstallCommand(targetAdapterType: string): string | null {
  return CLI_INSTALL_COMMANDS[targetAdapterType] ?? null;
}

export async function connectOrCreateSandbox(
  opts: SandboxConnectionOptions,
): Promise<Sandbox> {
  if (opts.sandboxId) {
    // Note: Sandbox.connect does not accept timeoutMs — it omits it from SandboxOpts
    return Sandbox.connect(opts.sandboxId, {
      apiKey: opts.apiKey,
    });
  }
  return Sandbox.create({
    apiKey: opts.apiKey,
    timeoutMs: opts.timeoutMs ?? 60_000,
  });
}

export async function ensureCliInstalled(
  sandbox: Sandbox,
  targetAdapterType: string,
): Promise<void> {
  const binary = getCliBinary(targetAdapterType);
  const check = await sandbox.commands.run(`which ${binary}`, { timeoutMs: 10_000 });
  if (check.exitCode === 0) return;

  const installCmd = getCliInstallCommand(targetAdapterType);
  if (!installCmd) {
    throw new Error(
      `Cannot install CLI for adapter type "${targetAdapterType}": no install command configured`,
    );
  }

  const install = await sandbox.commands.run(installCmd, { timeoutMs: 120_000 });
  if (install.exitCode !== 0) {
    throw new Error(
      `Failed to install ${binary} in sandbox: exit code ${install.exitCode}\n${install.stderr}`,
    );
  }
}

export async function runCommandInSandbox(
  sandbox: Sandbox,
  opts: SandboxCommandOptions,
): Promise<SandboxCommandResult> {
  let stdout = "";
  let stderr = "";

  const result = await sandbox.commands.run(opts.command, {
    envs: opts.envs,
    cwd: opts.cwd ?? "/workspace",
    timeoutMs: opts.timeoutMs,
    onStdout: (data: string) => {
      stdout += data;
      opts.onStdout?.(data);
    },
    onStderr: (data: string) => {
      stderr += data;
      opts.onStderr?.(data);
    },
  });

  return {
    exitCode: result.exitCode,
    stdout,
    stderr,
  };
}
