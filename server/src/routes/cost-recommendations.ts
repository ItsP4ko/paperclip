import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { costRecommendationService } from "../services/cost-recommendations.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

export function costRecommendationRoutes(db: Db) {
  const router = Router();
  const service = costRecommendationService(db);

  /**
   * List cost recommendations for a company.
   * Query params: status (pending|accepted|dismissed), limit, offset
   */
  router.get("/companies/:companyId/cost-recommendations", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const rows = await service.list(companyId, {
      status: req.query.status as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });

    res.json(rows);
  });

  /**
   * Generate (or refresh) cost recommendations by running all 5 analysis rules.
   * Clears existing pending recommendations and inserts fresh ones.
   */
  router.post("/companies/:companyId/cost-recommendations/generate", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const count = await service.generate(companyId);
    res.json({ generated: count });
  });

  /**
   * Accept or dismiss a cost recommendation.
   */
  router.patch("/companies/:companyId/cost-recommendations/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { status } = req.body as { status?: string };
    if (!status || !["accepted", "dismissed"].includes(status)) {
      throw badRequest("status must be 'accepted' or 'dismissed'");
    }

    const updated = await service.update(
      companyId,
      req.params.id as string,
      status as "accepted" | "dismissed",
    );
    if (!updated) throw notFound("Recommendation not found");
    res.json(updated);
  });

  return router;
}
