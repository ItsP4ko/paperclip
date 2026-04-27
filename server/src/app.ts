import express, { Router, type Request as ExpressRequest } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import type { StorageService } from "./storage/types.js";
import { httpLogger, errorHandler, createSecurityHeaders, createRateLimiter } from "./middleware/index.js";
import { createLoginRateLimiter } from "./middleware/login-rate-limit.js";
import type { RedisClientType } from "redis";
import { actorMiddleware } from "./middleware/auth.js";
import { boardMutationGuard } from "./middleware/board-mutation-guard.js";
import { privateHostnameGuard, resolvePrivateHostnameAllowSet } from "./middleware/private-hostname-guard.js";
import { createRemotePinAuthMiddleware, createRemotePinAuthHandler, parseCookies, validatePinSession, SESSION_COOKIE } from "./middleware/remote-pin-auth.js";
import { healthRoutes } from "./routes/health.js";
import { companyRoutes } from "./routes/companies.js";
import { companySkillRoutes } from "./routes/company-skills.js";
import { agentRoutes } from "./routes/agents.js";
import { projectRoutes } from "./routes/projects.js";
import { issueRoutes } from "./routes/issues.js";
import { routineRoutes } from "./routes/routines.js";
import { executionWorkspaceRoutes } from "./routes/execution-workspaces.js";
import { goalRoutes } from "./routes/goals.js";
import { approvalRoutes } from "./routes/approvals.js";
import { secretRoutes } from "./routes/secrets.js";
import { costRoutes } from "./routes/costs.js";
import { activityRoutes } from "./routes/activity.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { sidebarBadgeRoutes } from "./routes/sidebar-badges.js";
import { instanceSettingsRoutes } from "./routes/instance-settings.js";
import { llmRoutes } from "./routes/llms.js";
import { assetRoutes } from "./routes/assets.js";
import { accessRoutes } from "./routes/access.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { auditRoutes } from "./routes/audit.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { searchRoutes } from "./routes/search.js";
import { costRecommendationRoutes } from "./routes/cost-recommendations.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { sprintRoutes } from "./routes/sprints.js";
import { groupRoutes } from "./routes/groups.js";
import { runnerRoutes } from "./routes/runner.js";
import { geminiAnalysisRoutes } from "./routes/gemini-analysis.js";
import { remoteControlRoutes } from "./routes/remote-control.js";
import { applyUiBranding } from "./ui-branding.js";
import { logger } from "./middleware/logger.js";
import type { BetterAuthSessionResult } from "./auth/better-auth.js";

type UiMode = "none" | "static" | "vite-dev";
const FEEDBACK_EXPORT_FLUSH_INTERVAL_MS = 5_000;

export function resolveViteHmrPort(serverPort: number): number {
  if (serverPort <= 55_535) {
    return serverPort + 10_000;
  }
  return Math.max(1_024, serverPort - 10_000);
}

export async function createApp(
  db: Db,
  opts: {
    uiMode: UiMode;
    serverPort: number;
    storageService: StorageService;
    feedbackExportService?: {
      flushPendingFeedbackTraces(input?: {
        companyId?: string;
        limit?: number;
        now?: Date;
      }): Promise<unknown>;
    };
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    allowedHostnames: string[];
    bindHost: string;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    betterAuthHandler?: express.RequestHandler;
    resolveSession?: (req: ExpressRequest) => Promise<BetterAuthSessionResult | null>;
    redisClient?: RedisClientType;
    /** Additional allowed origins (full URLs, e.g. "tauri://localhost"). */
    extraAllowedOrigins?: string[];
  },
) {
  const app = express();
  app.set("trust proxy", 1);

  const corsAllowedOrigins = [
    ...opts.allowedHostnames.flatMap((h) => [
      `https://${h}`,
      `http://${h}`,
    ]),
    ...(opts.extraAllowedOrigins ?? []),
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        // Always allow loopback origins — browser sends Origin: http://localhost:PORT
        // for <script type="module"> requests, which must not be rejected in local dev.
        try {
          const { hostname } = new URL(origin);
          if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
            callback(null, true);
            return;
          }
        } catch {
          // fall through to allowlist check
        }
        if (corsAllowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
      exposedHeaders: ["set-auth-token"],
    }),
  );

  app.use(createSecurityHeaders({ viteDev: opts.uiMode === "vite-dev" }));
  app.use(createRateLimiter(opts.redisClient));

  app.use(express.json({
    // Company import/export payloads can inline full portable packages.
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  }));
  app.use(httpLogger);
  const privateHostnameGateEnabled =
    opts.deploymentMode === "authenticated" && opts.deploymentExposure === "private";
  const privateHostnameAllowSet = resolvePrivateHostnameAllowSet({
    allowedHostnames: opts.allowedHostnames,
    bindHost: opts.bindHost,
  });
  app.use(
    privateHostnameGuard({
      enabled: privateHostnameGateEnabled,
      allowedHostnames: opts.allowedHostnames,
      bindHost: opts.bindHost,
    }),
  );

  // PIN-based authentication for private remote control deployments
  const remotePin = process.env.PAPERCLIP_REMOTE_PIN?.trim();
  if (remotePin && opts.deploymentExposure === "private") {
    app.use(createRemotePinAuthMiddleware(remotePin));
    app.post("/api/remote-pin-auth", express.json(), createRemotePinAuthHandler(remotePin));
  }

  app.use(
    actorMiddleware(db, {
      deploymentMode: opts.deploymentMode,
      resolveSession: opts.resolveSession,
    }),
  );

  // Promote PIN-authenticated requests to board access.
  // The actor middleware does not know about PIN sessions, so requests that
  // passed the PIN gate still end up as { type: "none" }.  This middleware
  // fills the gap: if we are in remote-PIN mode and the request carries a
  // valid rc_session cookie, upgrade the actor to a local board user.
  if (remotePin && opts.deploymentExposure === "private") {
    app.use((req, _res, next) => {
      if (req.actor.type === "none") {
        const cookies = parseCookies(req.headers.cookie);
        if (validatePinSession(cookies[SESSION_COOKIE] ?? "", remotePin)) {
          req.actor = {
            type: "board",
            userId: "local-board",
            isInstanceAdmin: true,
            source: "remote_pin",
          };
        }
      }
      next();
    });
  }

  app.get("/api/auth/get-session", (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({
      session: {
        id: `paperclip:${req.actor.source}:${req.actor.userId}`,
        userId: req.actor.userId,
      },
      user: {
        id: req.actor.userId,
        email: null,
        name: req.actor.source === "local_implicit" || req.actor.source === "remote_pin" ? "Local Board" : null,
      },
    });
  });
  if (opts.betterAuthHandler) {
    app.all("/api/auth/sign-in/email", createLoginRateLimiter(opts.redisClient));
    app.all("/api/auth/*authPath", opts.betterAuthHandler);
  }
  app.use(llmRoutes(db));

  // Mount API routes
  const api = Router();
  const guardAllowedOrigins = [
    ...opts.allowedHostnames.flatMap((h) => [
      `https://${h}`,
      `http://${h}`,
    ]),
    ...(opts.extraAllowedOrigins ?? []),
  ];
  api.use(boardMutationGuard({ allowedOrigins: guardAllowedOrigins }));
  api.use(
    "/health",
    healthRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      companyDeletionEnabled: opts.companyDeletionEnabled,
    }),
  );
  api.use("/companies", companyRoutes(db, opts.storageService));
  api.use(companySkillRoutes(db));
  api.use(agentRoutes(db));
  api.use(assetRoutes(db, opts.storageService));
  api.use(projectRoutes(db));
  api.use(issueRoutes(db, opts.storageService, opts.redisClient));
  api.use(routineRoutes(db));
  api.use(executionWorkspaceRoutes(db));
  api.use(goalRoutes(db));
  api.use(approvalRoutes(db));
  api.use(secretRoutes(db));
  api.use(costRoutes(db));
  api.use(activityRoutes(db));
  api.use(dashboardRoutes(db, opts.redisClient));
  api.use(sidebarBadgeRoutes(db, opts.redisClient));
  api.use(instanceSettingsRoutes(db, opts.redisClient));
  api.use(analyticsRoutes(db));
  api.use(auditRoutes(db));
  api.use(knowledgeRoutes(db));
  api.use(searchRoutes(db));
  api.use(costRecommendationRoutes(db));
  api.use(pipelineRoutes(db, opts.redisClient));
  api.use(sprintRoutes(db));
  api.use(groupRoutes(db));
  api.use(runnerRoutes(db));
  api.use(geminiAnalysisRoutes(db, opts.storageService));
  api.use(remoteControlRoutes(db));
  api.use(
    accessRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      bindHost: opts.bindHost,
      allowedHostnames: opts.allowedHostnames,
    }),
  );
  app.use("/api", api);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  if (opts.uiMode === "static") {
    // Try published location first (server/ui-dist/), then monorepo dev location (../../ui/dist)
    const candidates = [
      path.resolve(__dirname, "../ui-dist"),
      path.resolve(__dirname, "../../ui/dist"),
    ];
    const uiDist = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
    if (uiDist) {
      const indexHtml = applyUiBranding(fs.readFileSync(path.join(uiDist, "index.html"), "utf-8"));
      app.use(express.static(uiDist));
      app.get(/.*/, (_req, res) => {
        res.status(200).set("Content-Type", "text/html").end(indexHtml);
      });
    } else {
      console.warn("[paperclip] UI dist not found; running in API-only mode");
    }
  }

  if (opts.uiMode === "vite-dev") {
    const uiRoot = path.resolve(__dirname, "../../ui");
    const hmrPort = resolveViteHmrPort(opts.serverPort);
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: uiRoot,
      appType: "custom",
      server: {
        middlewareMode: true,
        hmr: {
          host: opts.bindHost,
          port: hmrPort,
          clientPort: hmrPort,
        },
        allowedHosts: privateHostnameGateEnabled ? Array.from(privateHostnameAllowSet) : undefined,
      },
    });

    // Pre-warm before attaching middleware: server.warmup config only applies to Vite CLI,
    // not middlewareMode. Awaiting here ensures dep optimization finishes before server.listen()
    // is called, so the browser never hits unoptimized files.
    await Promise.all([
      vite.transformRequest('/@vite/client'),
      vite.transformRequest('/src/main.tsx'),
      vite.transformRequest('/@react-refresh'),
    ]).catch(() => {/* ignore warmup errors */});

    app.use(vite.middlewares);

    app.get(/.*/, async (req, res, next) => {
      try {
        const templatePath = path.resolve(uiRoot, "index.html");
        const template = fs.readFileSync(templatePath, "utf-8");
        const html = applyUiBranding(await vite.transformIndexHtml(req.originalUrl, template));
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.use(errorHandler);

  const feedbackExportTimer = opts.feedbackExportService
    ? setInterval(() => {
      void opts.feedbackExportService?.flushPendingFeedbackTraces().catch((err) => {
        logger.error({ err }, "Failed to flush pending feedback exports");
      });
    }, FEEDBACK_EXPORT_FLUSH_INTERVAL_MS)
    : null;
  feedbackExportTimer?.unref?.();
  if (opts.feedbackExportService) {
    void opts.feedbackExportService.flushPendingFeedbackTraces().catch((err) => {
      logger.error({ err }, "Failed to flush pending feedback exports");
    });
  }
  process.once("exit", () => {
    if (feedbackExportTimer) clearInterval(feedbackExportTimer);
  });

  return app;
}
