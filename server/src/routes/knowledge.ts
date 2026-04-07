import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { knowledgeService } from "../services/knowledge.js";
import { assertCompanyAccess } from "./authz.js";
import { notFound } from "../errors.js";
import { validate, validateQuery } from "../middleware/validate.js";

const createKnowledgeSchema = z.object({
  title:      z.string().min(1),
  content:    z.string().min(1),
  agentId:    z.string().optional(),
  category:   z.string().optional(),
  tags:       z.array(z.string()).optional(),
  pinned:     z.boolean().optional(),
  sourceType: z.string().optional(),
  sourceRef:  z.string().optional(),
  metadata:   z.record(z.unknown()).optional(),
});

const updateKnowledgeSchema = createKnowledgeSchema.partial();

const knowledgeListQuerySchema = z.object({
  agentId:  z.string().optional(),
  category: z.string().optional(),
  pinned:   z.string().optional(),
  q:        z.string().optional(),
  limit:    z.coerce.number().int().min(1).max(200).optional(),
  offset:   z.coerce.number().int().min(0).optional(),
});

const knowledgeSearchQuerySchema = z.object({
  q:       z.string().min(1),
  agentId: z.string().optional(),
  limit:   z.coerce.number().int().min(1).max(200).optional(),
});

export function knowledgeRoutes(db: Db) {
  const router = Router();
  const knowledge = knowledgeService(db);

  /**
   * List knowledge entries for a company (with optional agent/category/pinned filters).
   */
  router.get("/companies/:companyId/knowledge", validateQuery(knowledgeListQuerySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const rows = await knowledge.list({
      companyId,
      agentId: req.query.agentId as string | undefined,
      category: req.query.category as string | undefined,
      pinned: req.query.pinned === "true" ? true : req.query.pinned === "false" ? false : undefined,
      q: req.query.q as string | undefined,
      limit: req.query.limit as number | undefined,
      offset: req.query.offset as number | undefined,
    });

    res.json(rows);
  });

  /**
   * Full-text search across knowledge entries.
   */
  router.get("/companies/:companyId/knowledge/search", validateQuery(knowledgeSearchQuerySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const q = req.query.q as string;  // validated by Zod

    const rows = await knowledge.search(companyId, q, {
      agentId: req.query.agentId as string | undefined,
      limit: req.query.limit as number | undefined,
    });

    res.json(rows);
  });

  /**
   * Get distinct categories for filter dropdowns.
   */
  router.get("/companies/:companyId/knowledge/categories", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const categories = await knowledge.distinctCategories(companyId);
    res.json(categories);
  });

  /**
   * Get a single knowledge entry.
   */
  router.get("/companies/:companyId/knowledge/:entryId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const entry = await knowledge.getById(companyId, req.params.entryId as string);
    if (!entry) throw notFound("Knowledge entry not found");
    res.json(entry);
  });

  /**
   * Create a new knowledge entry.
   */
  router.post("/companies/:companyId/knowledge", validate(createKnowledgeSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { title, content, agentId, category, tags, pinned, sourceType, sourceRef, metadata } = req.body;

    const entry = await knowledge.create({
      companyId,
      agentId: agentId ?? null,
      title,
      content,
      category: category ?? null,
      tags: tags ?? [],
      pinned: pinned ?? false,
      sourceType: sourceType ?? "manual",
      sourceRef: sourceRef ?? null,
      metadata: metadata ?? null,
    });

    res.status(201).json(entry);
  });

  /**
   * Update a knowledge entry.
   */
  router.patch("/companies/:companyId/knowledge/:entryId", validate(updateKnowledgeSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const updated = await knowledge.update(companyId, req.params.entryId as string, req.body);
    if (!updated) throw notFound("Knowledge entry not found");
    res.json(updated);
  });

  /**
   * Delete a knowledge entry.
   */
  router.delete("/companies/:companyId/knowledge/:entryId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const deleted = await knowledge.delete(companyId, req.params.entryId as string);
    if (!deleted) throw notFound("Knowledge entry not found");
    res.json({ ok: true });
  });

  /**
   * Get knowledge injections for a specific run.
   */
  router.get("/companies/:companyId/knowledge/injections/:runId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const injections = await knowledge.getInjectionsForRun(req.params.runId as string);
    res.json(injections);
  });

  return router;
}
