import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sprints } from "./sprints.js";
import { issues } from "./issues.js";

export const sprintIssueHistory = pgTable(
  "sprint_issue_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sprintId: uuid("sprint_id").notNull().references(() => sprints.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removalReason: text("removal_reason"), // 'completed' | 'spilled_over' | 'removed'
    nextSprintId: uuid("next_sprint_id").references(() => sprints.id, { onDelete: "set null" }),
  },
  (table) => ({
    sprintIdx: index("sprint_issue_history_sprint_idx").on(table.sprintId),
    issueIdx: index("sprint_issue_history_issue_idx").on(table.issueId),
  }),
);
