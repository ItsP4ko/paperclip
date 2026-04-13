import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { groups } from "./groups.js";
import { projects } from "./projects.js";

export const groupProjects = pgTable(
  "group_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    addedByUserId: text("added_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    groupProjectUniqueIdx: uniqueIndex("group_projects_group_project_unique_idx").on(table.groupId, table.projectId),
    projectIdx: index("group_projects_project_idx").on(table.projectId),
  }),
);
