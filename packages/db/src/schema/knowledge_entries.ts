import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const knowledgeEntries = pgTable(
  "knowledge_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pinned: boolean("pinned").notNull().default(false),
    sourceType: text("source_type").notNull().default("manual"),
    sourceRef: text("source_ref"),
    searchVector: tsvector("search_vector"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("knowledge_entries_company_idx").on(table.companyId),
    companyAgentIdx: index("knowledge_entries_company_agent_idx").on(
      table.companyId,
      table.agentId,
    ),
    companyPinnedIdx: index("knowledge_entries_company_pinned_idx").on(
      table.companyId,
      table.pinned,
    ),
    companyCategoryIdx: index("knowledge_entries_company_category_idx").on(
      table.companyId,
      table.category,
    ),
    searchVectorIdx: index("knowledge_entries_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
  }),
);
