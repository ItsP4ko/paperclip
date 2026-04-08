import { Router } from "express";
import type { Db } from "@paperclipai/db";
import type { RedisClientType } from "redis";
import { and, eq, inArray, not, sql } from "drizzle-orm";
import { joinRequests, issues } from "@paperclipai/db";
import { sidebarBadgeService } from "../services/sidebar-badges.js";
import { accessService } from "../services/access.js";
import { dashboardService } from "../services/dashboard.js";
import { assertCompanyAccess } from "./authz.js";
import { logger } from "../middleware/logger.js";

const SIDEBAR_TTL_SECONDS = 20;

export function sidebarBadgeRoutes(db: Db, redisClient?: RedisClientType) {
  const router = Router();
  const svc = sidebarBadgeService(db);
  const access = accessService(db);
  const dashboard = dashboardService(db);

  router.get("/companies/:companyId/sidebar-badges", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    // Cache key is per-user because myTasks and join-approval permission are user-specific
    const actorKey =
      req.actor.type === "board" && req.actor.userId
        ? `user:${req.actor.userId}`
        : req.actor.type === "agent" && req.actor.agentId
          ? `agent:${req.actor.agentId}`
          : "anon";
    const cacheKey = `sidebar-badges:${companyId}:${actorKey}`;

    if (redisClient?.isReady) {
      const cached = await redisClient.get(cacheKey).catch(() => null);
      if (cached) {
        logger.debug("[redis] cache hit: sidebar-badges");
        res.json(JSON.parse(cached));
        return;
      }
    }

    let canApproveJoins = false;
    if (req.actor.type === "board") {
      canApproveJoins =
        req.actor.source === "local_implicit" ||
        Boolean(req.actor.isInstanceAdmin) ||
        (await access.canUser(companyId, req.actor.userId, "joins:approve"));
    } else if (req.actor.type === "agent" && req.actor.agentId) {
      canApproveJoins = await access.hasPermission(companyId, "agent", req.actor.agentId, "joins:approve");
    }

    const joinRequestCount = canApproveJoins
      ? await db
        .select({ count: sql<number>`count(*)` })
        .from(joinRequests)
        .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.status, "pending_approval")))
        .then((rows) => Number(rows[0]?.count ?? 0))
      : 0;

    let myTasksCount = 0;
    if (req.actor.type === "board" && req.actor.userId) {
      const myTasksRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.assigneeUserId, req.actor.userId),
            not(inArray(issues.status, ["done", "cancelled"])),
          )
        );
      myTasksCount = Number(myTasksRows[0]?.count ?? 0);
    }

    const badges = await svc.get(companyId, {
      joinRequests: joinRequestCount,
      myTasks: myTasksCount,
    });
    const summary = await dashboard.summary(companyId);
    const hasFailedRuns = badges.failedRuns > 0;
    const alertsCount =
      (summary.agents.error > 0 && !hasFailedRuns ? 1 : 0) +
      (summary.costs.monthBudgetCents > 0 && summary.costs.monthUtilizationPercent >= 80 ? 1 : 0);
    badges.inbox = badges.failedRuns + alertsCount + joinRequestCount + badges.approvals;

    if (redisClient?.isReady) {
      await redisClient
        .set(cacheKey, JSON.stringify(badges), { EX: SIDEBAR_TTL_SECONDS })
        .catch(() => logger.warn("[redis] failed to cache sidebar-badges"));
    }

    res.json(badges);
  });

  return router;
}
