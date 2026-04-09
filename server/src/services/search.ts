import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";

export interface SearchResult {
  type: "issue" | "agent" | "project" | "knowledge" | "run";
  id: string;
  title: string;
  subtitle: string | null;
  score: number;
}

export type SearchEntityType = SearchResult["type"];

const ALL_TYPES: SearchEntityType[] = ["issue", "agent", "project", "knowledge", "run"];

function buildTsQuery(q: string): string | null {
  const terms = q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");
  return terms || null;
}

export function searchService(db: Db) {
  return {
    search: async (
      companyId: string,
      q: string,
      opts?: { types?: SearchEntityType[]; limit?: number },
    ): Promise<SearchResult[]> => {
      const tsQuery = buildTsQuery(q);
      if (!tsQuery) return [];

      const limit = Math.min(opts?.limit ?? 20, 50);
      const types = opts?.types ?? ALL_TYPES;
      const subqueries: ReturnType<typeof sql>[] = [];

      if (types.includes("issue")) {
        subqueries.push(sql`
          SELECT 'issue'::text AS type, id::text, title,
                 identifier AS subtitle,
                 ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS score
          FROM issues
          WHERE company_id = ${companyId}
            AND search_vector @@ to_tsquery('english', ${tsQuery})
        `);
      }

      if (types.includes("agent")) {
        subqueries.push(sql`
          SELECT 'agent'::text AS type, id::text, name AS title,
                 role AS subtitle,
                 ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS score
          FROM agents
          WHERE company_id = ${companyId}
            AND search_vector @@ to_tsquery('english', ${tsQuery})
        `);
      }

      if (types.includes("project")) {
        subqueries.push(sql`
          SELECT 'project'::text AS type, id::text, name AS title,
                 LEFT(description, 100) AS subtitle,
                 ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS score
          FROM projects
          WHERE company_id = ${companyId}
            AND search_vector @@ to_tsquery('english', ${tsQuery})
        `);
      }

      if (types.includes("knowledge")) {
        subqueries.push(sql`
          SELECT 'knowledge'::text AS type, id::text, title,
                 category AS subtitle,
                 ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS score
          FROM knowledge_entries
          WHERE company_id = ${companyId}
            AND search_vector @@ to_tsquery('english', ${tsQuery})
        `);
      }

      if (types.includes("run")) {
        subqueries.push(sql`
          SELECT 'run'::text AS type, run_id::text AS id,
                 LEFT(message, 120) AS title,
                 NULL::text AS subtitle,
                 ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS score
          FROM heartbeat_run_events
          WHERE company_id = ${companyId}
            AND search_vector @@ to_tsquery('english', ${tsQuery})
        `);
      }

      if (subqueries.length === 0) return [];

      let unionSql = subqueries[0]!;
      for (let i = 1; i < subqueries.length; i++) {
        unionSql = sql`${unionSql} UNION ALL ${subqueries[i]!}`;
      }

      const rows = await db.execute<SearchResult>(sql`
        SELECT * FROM (${unionSql}) AS unified
        ORDER BY score DESC
        LIMIT ${limit}
      `);

      return (rows.rows ?? rows).map((r: any) => ({
        type: r.type as SearchResult["type"],
        id: String(r.id),
        title: String(r.title ?? ""),
        subtitle: r.subtitle ? String(r.subtitle) : null,
        score: Number(r.score),
      }));
    },
  };
}
