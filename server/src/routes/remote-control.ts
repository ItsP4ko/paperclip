import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { assertBoard, assertCompanyAccess } from "./authz.js";

export function remoteControlRoutes(db: Db) {
  const router = Router();

  // GET /api/companies/:companyId/remote-control/status
  // Returns the remote control configuration for the company.
  router.get("/companies/:companyId/remote-control/status", async (req, res) => {
    assertBoard(req);
    assertCompanyAccess(req, req.params.companyId);

    const [company] = await db
      .select({ remoteControlEnabled: companies.remoteControlEnabled })
      .from(companies)
      .where(eq(companies.id, req.params.companyId))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    res.json({
      remoteControlEnabled: company.remoteControlEnabled,
    });
  });

  return router;
}
