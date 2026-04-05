import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { knowledgeService } from "../services/knowledge.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

export function knowledgeRoutes(db: Db) {
  const router = Router();
  const knowledge = knowledgeService(db);

  /**
   * List knowledge entries for a company (with optional agent/category/pinned filters).
   */
  router.get("/companies/:companyId/knowledge", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const rows = await knowledge.list({
      companyId,
      agentId: req.query.agentId as string | undefined,
      category: req.query.category as string | undefined,
      pinned: req.query.pinned === "true" ? true : req.query.pinned === "false" ? false : undefined,
      q: req.query.q as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });

    res.json(rows);
  });

  /**
   * Full-text search across knowledge entries.
   */
  router.get("/companies/:companyId/knowledge/search", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const q = req.query.q as string | undefined;
    if (!q || !q.trim()) throw badRequest("'q' query parameter is required");

    const rows = await knowledge.search(companyId, q, {
      agentId: req.query.agentId as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
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
  router.post("/companies/:companyId/knowledge", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { title, content, agentId, category, tags, pinned, sourceType, sourceRef, metadata } = req.body;
    if (!title || !content) throw badRequest("'title' and 'content' are required");

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
  router.patch("/companies/:companyId/knowledge/:entryId", async (req, res) => {
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
