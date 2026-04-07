#!/usr/bin/env -S node --import tsx
/**
 * agent-runner.ts
 *
 * Starts the Paperclip backend in agent-only mode:
 *   - No frontend served (SERVE_UI=false)
 *   - No Vite dev middleware
 *   - Migrations auto-applied on first run
 *   - No file watching / auto-restart
 *
 * Usage:
 *   pnpm agent                        # local_trusted (loopback only)
 *   pnpm agent --tailscale-auth        # authenticated/private (Tailscale)
 *
 * The frontend is served exclusively from Vercel.
 * Users access the app at the Vercel URL; their local machine only runs agents.
 */

import { spawn } from "node:child_process";

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const tailscaleAuthFlagNames = new Set(["--tailscale-auth", "--authenticated-private"]);
let tailscaleAuth = false;
const forwardedArgs: string[] = [];

for (const arg of process.argv.slice(2)) {
  if (tailscaleAuthFlagNames.has(arg)) {
    tailscaleAuth = true;
  } else {
    forwardedArgs.push(arg);
  }
}

if (process.env.npm_config_tailscale_auth === "true") tailscaleAuth = true;

const env: NodeJS.ProcessEnv = {
  ...process.env,
  // Disable all UI serving — frontend lives on Vercel only
  SERVE_UI: "false",
  // Auto-apply DB migrations without prompting
  PAPERCLIP_MIGRATION_AUTO_APPLY: process.env.PAPERCLIP_MIGRATION_AUTO_APPLY ?? "true",
};

// Never set PAPERCLIP_UI_DEV_MIDDLEWARE — that would enable Vite
delete env.PAPERCLIP_UI_DEV_MIDDLEWARE;

if (tailscaleAuth) {
  env.PAPERCLIP_DEPLOYMENT_MODE = "authenticated";
  env.PAPERCLIP_DEPLOYMENT_EXPOSURE = "private";
  env.PAPERCLIP_AUTH_BASE_URL_MODE = "auto";
  env.HOST = "0.0.0.0";
  console.log("[paperclip] agent mode: authenticated/private (tailscale-friendly)");
} else {
  console.log("[paperclip] agent mode: local_trusted — frontend at Vercel only");
}

const child = spawn(
  pnpmBin,
  ["--filter", "@paperclipai/server", "dev", ...forwardedArgs],
  { stdio: "inherit", env, shell: process.platform === "win32" },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
