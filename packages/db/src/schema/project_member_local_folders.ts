import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";

export const projectMemberLocalFolders = pgTable(
  "project_member_local_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    cwd: text("cwd").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectMemberUniqueIdx: uniqueIndex("project_member_local_folders_project_member_idx")
      .on(table.projectId, table.principalType, table.principalId),
    companyIdx: index("project_member_local_folders_company_idx").on(table.companyId),
    projectIdx: index("project_member_local_folders_project_idx").on(table.projectId),
  }),
);
