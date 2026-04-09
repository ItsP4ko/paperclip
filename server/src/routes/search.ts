import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import { searchService, type SearchEntityType } from "../services/search.js";

const VALID_TYPES = new Set(["issue", "agent", "project", "knowledge", "run"]);

export function searchRoutes(db: Db) {
  const router = Router();
  const svc = searchService(db);

  router.get("/companies/:companyId/search", async (req, res) => {
    assertCompanyAccess(req, req.params.companyId!);

    const q = (req.query.q as string)?.trim();
    if (!q) {
      res.json([]);
      return;
    }

    const typesParam = req.query.types as string | undefined;
    let types: SearchEntityType[] | undefined;
    if (typesParam) {
      types = typesParam
        .split(",")
        .map((t) => t.trim())
        .filter((t) => VALID_TYPES.has(t)) as SearchEntityType[];
    }

    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 50) : 20;

    const results = await svc.search(req.params.companyId!, q, { types, limit });
    res.json(results);
  });

  return router;
}
