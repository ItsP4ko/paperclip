import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { costRecommendationService } from "../services/cost-recommendations.js";
import { assertCompanyAccess } from "./authz.js";
import { notFound } from "../errors.js";
import { validate, validateQuery } from "../middleware/validate.js";

const updateCostRecommendationSchema = z.object({
  status: z.enum(["accepted", "dismissed"]),
});

const costRecommendationsListQuerySchema = z.object({
  status: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export function costRecommendationRoutes(db: Db) {
  const router = Router();
  const service = costRecommendationService(db);

  /**
   * List cost recommendations for a company.
   * Query params: status (pending|accepted|dismissed), limit, offset
   */
  router.get("/companies/:companyId/cost-recommendations", validateQuery(costRecommendationsListQuerySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const rows = await service.list(companyId, {
      status: req.query.status as string | undefined,
      limit: req.query.limit as number | undefined,
      offset: req.query.offset as number | undefined,
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
  router.patch("/companies/:companyId/cost-recommendations/:id", validate(updateCostRecommendationSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { status } = req.body;

    const updated = await service.update(
      companyId,
      req.params.id as string,
      status,
    );
    if (!updated) throw notFound("Recommendation not found");
    res.json(updated);
  });

  return router;
}
