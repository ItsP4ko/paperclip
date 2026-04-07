import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { analyticsService } from "../services/analytics.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";

const VALID_GRANULARITIES = new Set(["day", "week", "month"]);
const VALID_GROUP_BY = new Set(["agent", "provider", "model"]);

export function analyticsRoutes(db: Db) {
  const router = Router();
  const analytics = analyticsService(db);

  function parseDateRange(query: Record<string, unknown>) {
    const fromRaw = query.from as string | undefined;
    const toRaw = query.to as string | undefined;
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if (from && isNaN(from.getTime())) throw badRequest("invalid 'from' date");
    if (to && isNaN(to.getTime())) throw badRequest("invalid 'to' date");
    return from || to ? { from, to } : undefined;
  }

  router.get("/companies/:companyId/analytics/spend-over-time", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const granularity = (req.query.granularity as string) || "day";
    if (!VALID_GRANULARITIES.has(granularity)) {
      throw badRequest("granularity must be day, week, or month");
    }

    const groupBy = (req.query.groupBy as string) || "agent";
    if (!VALID_GROUP_BY.has(groupBy)) {
      throw badRequest("groupBy must be agent, provider, or model");
    }

    const range = parseDateRange(req.query);
    const rows = await analytics.spendOverTime(
      companyId,
      granularity as "day" | "week" | "month",
      groupBy as "agent" | "provider" | "model",
      range,
    );
    res.json(rows);
  });

  router.get("/companies/:companyId/analytics/agent-performance", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const range = parseDateRange(req.query);
    const agentId = req.query.agentId as string | undefined;
    const rows = await analytics.agentPerformance(companyId, range, agentId);
    res.json(rows);
  });

  router.get("/companies/:companyId/analytics/adapter-comparison", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const range = parseDateRange(req.query);
    const rows = await analytics.adapterComparison(companyId, range);
    res.json(rows);
  });

  return router;
}
