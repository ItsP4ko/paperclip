export const type = "e2b_sandbox";
export const label = "E2B Sandbox (cloud)";

export const TARGET_ADAPTER_TYPES = [
  "claude_local",
  "codex_local",
  "opencode_local",
  "pi_local",
  "gemini_local",
] as const;

export type TargetAdapterType = (typeof TARGET_ADAPTER_TYPES)[number];

export const targetAdapterLabels: Record<TargetAdapterType, string> = {
  claude_local: "Claude Code",
  codex_local: "Codex",
  opencode_local: "OpenCode",
  pi_local: "Pi",
  gemini_local: "Gemini CLI",
};

export const models: Array<{ id: string; label: string }> = [];

export const agentConfigurationDoc = `# e2b_sandbox agent configuration

Adapter: e2b_sandbox

Use when:
- You want to run agent CLIs in a cloud sandbox without local installation
- You need multi-agent collaboration on a shared filesystem
- You want agents accessible from the web without a local machine running

Don't use when:
- The agent CLI is already installed locally and performance matters (use the local adapter directly)
- You only need one-shot shell commands (use process)
- You need webhook-style external invocation (use http)

Core fields:
- targetAdapterType (string, required): which CLI to run inside the sandbox. One of: claude_local, codex_local, opencode_local, pi_local, gemini_local
- model (string, required): model id for the target CLI
- promptTemplate (string, optional): prompt template passed to the target CLI
- sandboxPlan ("managed" | "byok", optional): billing plan. Defaults to "managed"
- e2bApiKey (string, optional): E2B API key for BYOK plan

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): grace period in seconds

Notes:
- Sandboxes are persistent per project. All agents in the same project share one sandbox.
- Sub-agents spawned by the main agent share the same filesystem automatically.
- Sandboxes sleep after inactivity and are destroyed after 7 days sleeping or 10 days without runs.
- The target CLI is installed automatically on first use.
`;
