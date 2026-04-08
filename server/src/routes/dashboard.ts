import { Router } from "express";
import type { Db } from "@paperclipai/db";
import type { RedisClientType } from "redis";
import { dashboardService } from "../services/dashboard.js";
import { assertCompanyAccess } from "./authz.js";
import { logger } from "../middleware/logger.js";

const DASHBOARD_TTL_SECONDS = 30;

export function dashboardRoutes(db: Db, redisClient?: RedisClientType) {
  const router = Router();
  const svc = dashboardService(db);

  router.get("/companies/:companyId/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const cacheKey = `dashboard:${companyId}`;

    if (redisClient?.isReady) {
      const cached = await redisClient.get(cacheKey).catch(() => null);
      if (cached) {
        logger.debug("[redis] cache hit: dashboard");
        res.json(JSON.parse(cached));
        return;
      }
    }

    const summary = await svc.summary(companyId);

    if (redisClient?.isReady) {
      await redisClient
        .set(cacheKey, JSON.stringify(summary), { EX: DASHBOARD_TTL_SECONDS })
        .catch(() => logger.warn("[redis] failed to cache dashboard"));
    }

    res.json(summary);
  });

  return router;
}
