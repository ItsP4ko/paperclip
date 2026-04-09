import { pgTable, uuid, text, timestamp, date, index } from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

export const sprints = pgTable(
  "sprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("planning"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectStatusIdx: index("sprints_project_status_idx").on(table.projectId, table.status),
  }),
);
