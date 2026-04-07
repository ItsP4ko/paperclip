import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { auditService } from "../services/audit.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";

export function auditRoutes(db: Db) {
  const router = Router();
  const audit = auditService(db);

  function parseDateRange(query: Record<string, unknown>) {
    const fromRaw = query.from as string | undefined;
    const toRaw = query.to as string | undefined;
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if (from && isNaN(from.getTime())) throw badRequest("invalid 'from' date");
    if (to && isNaN(to.getTime())) throw badRequest("invalid 'to' date");
    return { from, to };
  }

  /**
   * Paginated audit timeline with filters and actor name resolution.
   */
  router.get("/companies/:companyId/audit/timeline", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { from, to } = parseDateRange(req.query);
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
    if (req.query.limit && (!Number.isFinite(limit) || limit <= 0)) {
      throw badRequest("invalid 'limit' value");
    }

    const result = await audit.timeline({
      companyId,
      from,
      to,
      actorType: req.query.actorType as string | undefined,
      entityType: req.query.entityType as string | undefined,
      action: req.query.action as string | undefined,
      cursor: req.query.cursor as string | undefined,
      limit,
    });

    res.json(result);
  });

  /**
   * Filter options for the audit timeline UI (distinct actions and entity types).
   */
  router.get("/companies/:companyId/audit/filters", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const [actions, entityTypes] = await Promise.all([
      audit.distinctActions(companyId),
      audit.distinctEntityTypes(companyId),
    ]);

    res.json({ actions, entityTypes });
  });

  /**
   * Streaming export of audit log in JSON or CSV format.
   */
  router.get("/companies/:companyId/audit/export", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const format = (req.query.format as string) || "json";
    if (format !== "json" && format !== "csv") {
      throw badRequest("format must be json or csv");
    }

    const { from, to } = parseDateRange(req.query);

    const filename = `audit-${companyId}-${new Date().toISOString().slice(0, 10)}.${format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.write("id,created_at,actor_type,actor_id,action,entity_type,entity_id,details\n");

      for await (const batch of audit.exportBatches({
        companyId,
        from,
        to,
        actorType: req.query.actorType as string | undefined,
        entityType: req.query.entityType as string | undefined,
      })) {
        for (const row of batch) {
          const details = row.details ? JSON.stringify(row.details).replace(/"/g, '""') : "";
          res.write(
            `${row.id},${row.createdAt.toISOString()},${row.actorType},${row.actorId},${row.action},${row.entityType},${row.entityId},"${details}"\n`,
          );
        }
      }
    } else {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.write("[\n");
      let first = true;

      for await (const batch of audit.exportBatches({
        companyId,
        from,
        to,
        actorType: req.query.actorType as string | undefined,
        entityType: req.query.entityType as string | undefined,
      })) {
        for (const row of batch) {
          if (!first) res.write(",\n");
          res.write(JSON.stringify(row));
          first = false;
        }
      }
      res.write("\n]");
    }

    res.end();
  });

  /**
   * GDPR: Export all user data within a company.
   */
  router.get("/companies/:companyId/members/:userId/data-export", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = req.params.userId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const data = await audit.userDataExport(companyId, userId);
    const filename = `user-data-${userId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(data);
  });

  /**
   * GDPR: Anonymize/erase user data within a company.
   */
  router.post("/companies/:companyId/members/:userId/data-erasure", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = req.params.userId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const result = await audit.userDataErasure(companyId, userId);
    res.json(result);
  });

  return router;
}
