import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { projects } from "./projects.js";
import { assets } from "./assets.js";

export const projectDocuments = pgTable(
  "project_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("project_documents_project_idx").on(table.projectId),
    companyProjectIdx: index("project_documents_company_project_idx").on(table.companyId, table.projectId),
  }),
);
