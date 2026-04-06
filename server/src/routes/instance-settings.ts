import { Router, type Request } from "express";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { Db } from "@paperclipai/db";
import type { RedisClientType } from "redis";
import { patchInstanceExperimentalSettingsSchema, patchInstanceGeneralSettingsSchema } from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { instanceSettingsService, logActivity } from "../services/index.js";
import { logger } from "../middleware/logger.js";
import { getActorInfo } from "./authz.js";

const execFileAsync = promisify(execFile);

function buildPathEnv(): NodeJS.ProcessEnv {
  const existing = process.env.PATH ?? "";
  const home = process.env.HOME ?? "";
  const extras = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    home ? `${home}/.local/bin` : "",
    home ? `${home}/.nvm/current/bin` : "",
    home ? `${home}/.volta/bin` : "",
  ].filter(Boolean);
  const combined = [...existing.split(":"), ...extras].filter(Boolean).join(":");
  return { ...process.env, PATH: combined };
}

type AdapterAuthStatus = {
  available: boolean;
  loggedIn: boolean;
  email?: string;
  method?: string;
  detail?: string;
};

async function getClaudeAuthStatus(): Promise<AdapterAuthStatus> {
  try {
    const { stdout } = await execFileAsync("claude", ["auth", "status"], {
      env: buildPathEnv(),
      timeout: 6000,
    });
    const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
    return {
      available: true,
      loggedIn: parsed.loggedIn === true,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      method: typeof parsed.authMethod === "string" ? parsed.authMethod : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const notFound = msg.includes("ENOENT") || msg.includes("not found");
    return { available: !notFound, loggedIn: false, detail: notFound ? "claude CLI not found" : msg.slice(0, 120) };
  }
}

async function getGeminiAuthStatus(): Promise<AdapterAuthStatus> {
  // Gemini has no machine-readable status command; detect via env vars or a quick probe
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return { available: true, loggedIn: true, method: "api_key" };
  }
  if (process.env.GOOGLE_GENAI_USE_GCA === "true") {
    return { available: true, loggedIn: true, method: "google_account" };
  }
  try {
    await execFileAsync("gemini", ["--version"], { env: buildPathEnv(), timeout: 5000 });
    return { available: true, loggedIn: false, detail: "No API key or OAuth found. Run gemini auth login." };
  } catch {
    return { available: false, loggedIn: false, detail: "gemini CLI not found" };
  }
}

async function getCodexAuthStatus(): Promise<AdapterAuthStatus> {
  if (process.env.OPENAI_API_KEY) {
    return { available: true, loggedIn: true, method: "api_key" };
  }
  // Try reading ~/.codex/auth.json
  try {
    const home = process.env.HOME ?? "";
    const authPath = `${home}/.codex/auth.json`;
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(authPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const email = typeof parsed.email === "string" ? parsed.email : undefined;
    return { available: true, loggedIn: true, email, method: "codex_auth" };
  } catch {
    // no auth file; check if CLI is available
    try {
      await execFileAsync("codex", ["--version"], { env: buildPathEnv(), timeout: 5000 });
      return { available: true, loggedIn: false, detail: "No OPENAI_API_KEY and no auth file found." };
    } catch {
      return { available: false, loggedIn: false, detail: "codex CLI not found" };
    }
  }
}

function assertCanManageInstanceSettings(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
    return;
  }
  throw forbidden("Instance admin access required");
}

export function instanceSettingsRoutes(db: Db, redisClient?: RedisClientType) {
  const router = Router();
  const svc = instanceSettingsService(db);

  const CACHE_KEY = "instance:settings:general";
  const TTL_SECONDS = 60;

  router.get("/instance/settings/general", async (req, res) => {
    // General settings (e.g. keyboardShortcuts) are readable by any
    // authenticated board user.  Only PATCH requires instance-admin.
    if (req.actor.type !== "board") {
      throw forbidden("Board access required");
    }

    if (redisClient?.isReady) {
      const cached = await redisClient.get(CACHE_KEY).catch(() => null);
      if (cached) {
        logger.debug("[redis] cache hit: instance settings");
        res.json(JSON.parse(cached));
        return;
      }
    }

    const settings = await svc.getGeneral();

    if (redisClient?.isReady) {
      await redisClient.set(CACHE_KEY, JSON.stringify(settings), { EX: TTL_SECONDS }).catch(() => {
        logger.warn("[redis] failed to cache instance settings");
      });
    }

    res.json(settings);
  });

  router.patch(
    "/instance/settings/general",
    validate(patchInstanceGeneralSettingsSchema),
    async (req, res) => {
      assertCanManageInstanceSettings(req);
      const updated = await svc.updateGeneral(req.body);

      if (redisClient?.isReady) {
        await redisClient.del(CACHE_KEY).catch(() => {
          logger.warn("[redis] failed to invalidate instance settings cache");
        });
      }

      const actor = getActorInfo(req);
      const companyIds = await svc.listCompanyIds();
      await Promise.all(
        companyIds.map((companyId) =>
          logActivity(db, {
            companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "instance.settings.general_updated",
            entityType: "instance_settings",
            entityId: updated.id,
            details: {
              general: updated.general,
              changedKeys: Object.keys(req.body).sort(),
            },
          }),
        ),
      );
      res.json(updated.general);
    },
  );

  router.get("/instance/settings/experimental", async (req, res) => {
    // Experimental settings are readable by any authenticated board user.
    // Only PATCH requires instance-admin.
    if (req.actor.type !== "board") {
      throw forbidden("Board access required");
    }
    res.json(await svc.getExperimental());
  });

  router.patch(
    "/instance/settings/experimental",
    validate(patchInstanceExperimentalSettingsSchema),
    async (req, res) => {
      assertCanManageInstanceSettings(req);
      const updated = await svc.updateExperimental(req.body);
      const actor = getActorInfo(req);
      const companyIds = await svc.listCompanyIds();
      await Promise.all(
        companyIds.map((companyId) =>
          logActivity(db, {
            companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "instance.settings.experimental_updated",
            entityType: "instance_settings",
            entityId: updated.id,
            details: {
              experimental: updated.experimental,
              changedKeys: Object.keys(req.body).sort(),
            },
          }),
        ),
      );
      res.json(updated.experimental);
    },
  );

  // --- Adapter auth status ---
  router.get("/instance/adapter-auth/:type/status", async (req, res) => {
    assertCanManageInstanceSettings(req);
    const type = req.params.type;
    let status: AdapterAuthStatus;
    if (type === "claude_local") {
      status = await getClaudeAuthStatus();
    } else if (type === "gemini_local") {
      status = await getGeminiAuthStatus();
    } else if (type === "codex_local") {
      status = await getCodexAuthStatus();
    } else {
      res.status(404).json({ error: `No auth status support for adapter: ${type}` });
      return;
    }
    res.json(status);
  });

  // --- Adapter auth login (spawns CLI login, opens browser) ---
  router.post("/instance/adapter-auth/:type/login", async (req, res) => {
    assertCanManageInstanceSettings(req);
    const type = req.params.type;
    const env = buildPathEnv();

    const loginCommands: Record<string, { cmd: string; args: string[] }> = {
      claude_local: { cmd: "claude", args: ["auth", "login"] },
      gemini_local: { cmd: "gemini", args: ["auth", "login"] },
      codex_local:  { cmd: "codex",  args: ["login"] },
    };

    const loginCmd = loginCommands[type];
    if (!loginCmd) {
      res.status(404).json({ error: `No login command for adapter: ${type}` });
      return;
    }

    try {
      const proc = spawn(loginCmd.cmd, loginCmd.args, {
        env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Capture the auth URL from CLI output (wait up to 10s)
      const authUrl = await new Promise<string | undefined>((resolve) => {
        const timer = setTimeout(() => resolve(undefined), 10000);
        const urlRe = /https?:\/\/[^\s"'<>]+/;

        const handleData = (chunk: Buffer | string) => {
          const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
          const match = urlRe.exec(text);
          if (match) {
            clearTimeout(timer);
            resolve(match[0]);
          }
        };

        proc.stdout?.on("data", handleData);
        proc.stderr?.on("data", handleData);
        proc.on("exit", () => { clearTimeout(timer); resolve(undefined); });
      });

      // Drain streams so the process doesn't block on write, then detach
      proc.stdout?.resume();
      proc.stderr?.resume();
      proc.unref();

      logger.info(`[adapter-auth] spawned login for ${type}, authUrl=${authUrl ?? "none"}`);
      res.json({ started: true, authUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
