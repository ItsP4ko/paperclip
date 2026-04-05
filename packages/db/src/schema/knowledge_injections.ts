import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { knowledgeEntries } from "./knowledge_entries.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const knowledgeInjections = pgTable(
  "knowledge_injections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeEntryId: uuid("knowledge_entry_id")
      .notNull()
      .references(() => knowledgeEntries.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => heartbeatRuns.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    injectedAt: timestamp("injected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    runIdx: index("knowledge_injections_run_idx").on(table.runId),
    entryIdx: index("knowledge_injections_entry_idx").on(
      table.knowledgeEntryId,
    ),
    companyAgentIdx: index("knowledge_injections_company_agent_idx").on(
      table.companyId,
      table.agentId,
    ),
  }),
);
