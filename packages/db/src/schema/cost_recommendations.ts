import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const costRecommendations = pgTable(
  "cost_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").references(() => agents.id),
    type: text("type").notNull(), // downgrade_model | pause_idle | switch_adapter | high_failure_rate | budget_underutilized
    severity: text("severity").notNull(), // low | medium | high
    estimatedSavingsCents: integer("estimated_savings_cents").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | accepted | dismissed
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("cost_recommendations_company_idx").on(table.companyId),
    companyStatusIdx: index("cost_recommendations_company_status_idx").on(table.companyId, table.status),
  }),
);
