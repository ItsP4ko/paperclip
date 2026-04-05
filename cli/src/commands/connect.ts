import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { upsertProfile } from "../client/context.js";
import { setStoredBoardCredential } from "../client/board-auth.js";

interface ConnectOptions {
  server: string;
  token: string;
  context?: string;
  profile?: string;
  authStore?: string;
}

interface HealthResponse {
  status?: string;
  [key: string]: unknown;
}

interface MeResponse {
  userId?: string;
  email?: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
  } | null;
}

function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function registerConnectCommand(program: Command): void {
  program
    .command("connect")
    .description("Connect CLI to a Relay Control server and verify credentials")
    .requiredOption("-s, --server <url>", "Relay Control server URL")
    .requiredOption("-t, --token <token>", "Bearer token for authentication")
    .option("--context <path>", "Path to CLI context file")
    .option("--profile <name>", "Profile name (default: current profile)")
    .option("--auth-store <path>", "Path to auth store file")
    .action(async (opts: ConnectOptions) => {
      const server = normalizeServerUrl(opts.server);

      p.intro(pc.bgCyan(pc.black(" relaycontrol connect ")));

      const s = p.spinner();

      // 1. Save server URL to context profile
      s.start("Saving server URL to profile");
      try {
        upsertProfile(
          opts.profile ?? "default",
          { apiBase: server },
          opts.context,
        );
        s.stop("Server URL saved to profile");
      } catch (err) {
        s.stop("Failed to save server URL");
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      // 2. Save bearer token as board credential
      s.start("Saving auth credentials");
      try {
        setStoredBoardCredential({
          apiBase: server,
          token: opts.token,
          storePath: opts.authStore,
        });
        s.stop("Auth credentials saved");
      } catch (err) {
        s.stop("Failed to save credentials");
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      // 3. Verify server connectivity
      s.start("Checking server health");
      try {
        const healthUrl = `${server}/api/health`;
        const res = await fetch(healthUrl, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`Health check returned HTTP ${res.status}`);
        }
        const body = (await res.json()) as HealthResponse;
        s.stop(`Server is reachable (status: ${body.status ?? "ok"})`);
      } catch (err) {
        s.stop("Server health check failed");
        p.log.error(
          `Could not reach ${server}/api/health\n` +
            (err instanceof Error ? err.message : String(err)),
        );
        process.exit(1);
      }

      // 4. Verify auth token
      s.start("Verifying authentication");
      try {
        const meUrl = `${server}/api/cli-auth/me`;
        const res = await fetch(meUrl, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${opts.token}`,
          },
        });
        if (!res.ok) {
          throw new Error(`Auth verification returned HTTP ${res.status}`);
        }
        const me = (await res.json()) as MeResponse;
        const email = me.email ?? me.user?.email ?? "unknown";
        const userId = me.userId ?? me.user?.id ?? null;

        // Update credential with userId now that we know it
        if (userId) {
          setStoredBoardCredential({
            apiBase: server,
            token: opts.token,
            userId,
            storePath: opts.authStore,
          });
        }

        s.stop(`Authenticated as ${pc.bold(email)}`);
      } catch (err) {
        s.stop("Authentication failed");
        p.log.error(
          `Token verification failed against ${server}/api/cli-auth/me\n` +
            (err instanceof Error ? err.message : String(err)),
        );
        process.exit(1);
      }

      p.log.success(`Connected to ${pc.cyan(server)}`);
      p.outro("Connection verified. You're ready to go.");
    });
}
