import { pgTable, uuid, text, timestamp, bigint, index } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { sprints } from "./sprints.js";

export const issueStateHistory = pgTable(
  "issue_state_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    sprintId: uuid("sprint_id").references(() => sprints.id, { onDelete: "set null" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedByType: text("changed_by_type").notNull(),
    changedById: uuid("changed_by_id").notNull(),
    durationMs: bigint("duration_ms", { mode: "number" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("issue_state_history_issue_idx").on(table.issueId),
    sprintIdx: index("issue_state_history_sprint_idx").on(table.sprintId),
    changedByIdx: index("issue_state_history_changed_by_idx").on(table.changedById),
  }),
);
