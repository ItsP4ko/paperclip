import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const heartbeatRunTurns = pgTable(
  "heartbeat_run_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => heartbeatRuns.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    seq: integer("seq").notNull(),
    role: text("role").notNull(), // 'agent' | 'human'
    prompt: text("prompt"),
    status: text("status").notNull().default("running"),
    exitCode: integer("exit_code"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runSeqIdx: index("heartbeat_run_turns_run_seq_idx").on(table.runId, table.seq),
  }),
);
