# Company Brain + Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic knowledge extraction from agent transcripts (Company Brain) and unified full-text search across all entities (Global Search) to Paperclip.

**Architecture:** Company Brain hooks into `completeLocalRun()` to trigger Gemini-based fact extraction into `knowledge_entries`. Global Search adds tsvector columns to issues/agents/projects/heartbeat_run_events and exposes a unified `UNION ALL` search endpoint consumed by CommandPalette.

**Tech Stack:** PostgreSQL tsvector + GIN indexes, Gemini 2.5-flash-lite, Drizzle ORM, React + TanStack Query, shadcn CommandDialog

---

## Task 1: Global Search — Database Migration

**Files:**
- Create: `packages/db/src/migrations/0064_global_search.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 0064_global_search.sql
-- Add full-text search vectors to issues, agents, projects, heartbeat_run_events

-- ============================================================
-- ISSUES
-- ============================================================
ALTER TABLE issues ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION issues_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.identifier, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS issues_search_vector_trigger ON issues;
CREATE TRIGGER issues_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, identifier, description ON issues
  FOR EACH ROW EXECUTE FUNCTION issues_search_vector_update();

CREATE INDEX IF NOT EXISTS issues_search_vector_idx ON issues USING gin(search_vector);

UPDATE issues SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(identifier, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B')
WHERE search_vector IS NULL;

-- ============================================================
-- AGENTS
-- ============================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION agents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.role, '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agents_search_vector_trigger ON agents;
CREATE TRIGGER agents_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, role ON agents
  FOR EACH ROW EXECUTE FUNCTION agents_search_vector_update();

CREATE INDEX IF NOT EXISTS agents_search_vector_idx ON agents USING gin(search_vector);

UPDATE agents SET search_vector =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(role, '')), 'B')
WHERE search_vector IS NULL;

-- ============================================================
-- PROJECTS
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION projects_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_search_vector_trigger ON projects;
CREATE TRIGGER projects_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description ON projects
  FOR EACH ROW EXECUTE FUNCTION projects_search_vector_update();

CREATE INDEX IF NOT EXISTS projects_search_vector_idx ON projects USING gin(search_vector);

UPDATE projects SET search_vector =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B')
WHERE search_vector IS NULL;

-- ============================================================
-- HEARTBEAT_RUN_EVENTS
-- ============================================================
ALTER TABLE heartbeat_run_events ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION hre_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.message, '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hre_search_vector_trigger ON heartbeat_run_events;
CREATE TRIGGER hre_search_vector_trigger
  BEFORE INSERT ON heartbeat_run_events
  FOR EACH ROW EXECUTE FUNCTION hre_search_vector_update();

CREATE INDEX IF NOT EXISTS hre_search_vector_idx ON heartbeat_run_events USING gin(search_vector);

-- Backfill in batches of 10000 to avoid locking
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE heartbeat_run_events
    SET search_vector = setweight(to_tsvector('english', COALESCE(message, '')), 'B')
    WHERE id IN (
      SELECT id FROM heartbeat_run_events WHERE search_vector IS NULL LIMIT batch_size
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;
```

- [ ] **Step 2: Register migration in journal**

Read `packages/db/src/migrations/meta/_journal.json`, add the new entry after entry 0063:

```json
{
  "idx": 64,
  "version": "7",
  "when": 1744156800000,
  "tag": "0064_global_search",
  "breakpoints": true
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/migrations/0064_global_search.sql packages/db/src/migrations/meta/_journal.json
git commit -m "feat(db): add tsvector search columns to issues, agents, projects, heartbeat_run_events"
```

---

## Task 2: Global Search — Backend Service

**Files:**
- Create: `server/src/services/search.ts`

- [ ] **Step 1: Create the search service**

```typescript
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

      // Build UNION ALL with Drizzle sql template
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
```

- [ ] **Step 2: Export from services index**

Add to `server/src/services/index.ts`:

```typescript
export { searchService } from "./search.js";
```

- [ ] **Step 3: Commit**

```bash
git add server/src/services/search.ts server/src/services/index.ts
git commit -m "feat: add unified search service with UNION ALL across entities"
```

---

## Task 3: Global Search — API Route

**Files:**
- Create: `server/src/routes/search.ts`
- Modify: `server/src/app.ts` (add route registration)

- [ ] **Step 1: Create the search route**

```typescript
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import { searchService, type SearchEntityType } from "../services/search.js";

const VALID_TYPES = new Set(["issue", "agent", "project", "knowledge", "run"]);

export function searchRoutes(db: Db) {
  const router = Router();
  const svc = searchService(db);

  router.get("/companies/:companyId/search", async (req, res) => {
    assertCompanyAccess(req, req.params.companyId!);

    const q = (req.query.q as string)?.trim();
    if (!q) {
      res.json([]);
      return;
    }

    const typesParam = req.query.types as string | undefined;
    let types: SearchEntityType[] | undefined;
    if (typesParam) {
      types = typesParam
        .split(",")
        .map((t) => t.trim())
        .filter((t) => VALID_TYPES.has(t)) as SearchEntityType[];
    }

    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 50) : 20;

    const results = await svc.search(req.params.companyId!, q, { types, limit });
    res.json(results);
  });

  return router;
}
```

- [ ] **Step 2: Register in app.ts**

Add import at top of `server/src/app.ts` near the other route imports:

```typescript
import { searchRoutes } from "./routes/search.js";
```

Add after the `api.use(knowledgeRoutes(db));` line (around line 264):

```typescript
api.use(searchRoutes(db));
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/search.ts server/src/app.ts
git commit -m "feat: add GET /companies/:companyId/search unified search endpoint"
```

---

## Task 4: Global Search — Frontend API Client + QueryKeys

**Files:**
- Create: `ui/src/api/search.ts`
- Modify: `ui/src/lib/queryKeys.ts`

- [ ] **Step 1: Create frontend API client**

```typescript
import { api } from "./client";

export interface SearchResult {
  type: "issue" | "agent" | "project" | "knowledge" | "run";
  id: string;
  title: string;
  subtitle: string | null;
  score: number;
}

export const searchApi = {
  search: (companyId: string, q: string, opts?: { types?: string; limit?: number }) => {
    const params = new URLSearchParams({ q });
    if (opts?.types) params.set("types", opts.types);
    if (opts?.limit) params.set("limit", String(opts.limit));
    return api.get<SearchResult[]>(`/companies/${companyId}/search?${params.toString()}`);
  },
};
```

- [ ] **Step 2: Add query key**

Add to `queryKeys` object in `ui/src/lib/queryKeys.ts`, after the `knowledge` section:

```typescript
search: {
  query: (companyId: string, q: string) => ["search", companyId, q] as const,
},
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/api/search.ts ui/src/lib/queryKeys.ts
git commit -m "feat(ui): add search API client and query keys"
```

---

## Task 5: Global Search — Update CommandPalette

**Files:**
- Modify: `ui/src/components/CommandPalette.tsx`

- [ ] **Step 1: Rewrite CommandPalette to use unified search**

Replace the full content of `ui/src/components/CommandPalette.tsx` with:

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { searchApi, type SearchResult } from "../api/search";
import { queryKeys } from "../lib/queryKeys";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  CircleDot,
  Bot,
  Hexagon,
  Target,
  LayoutDashboard,
  Inbox,
  DollarSign,
  History,
  SquarePen,
  Plus,
  Brain,
  Play,
} from "lucide-react";

const TYPE_CONFIG: Record<
  SearchResult["type"],
  { label: string; icon: typeof CircleDot; urlPrefix: string }
> = {
  issue: { label: "Issues", icon: CircleDot, urlPrefix: "/issues/" },
  agent: { label: "Agents", icon: Bot, urlPrefix: "/agents/" },
  project: { label: "Projects", icon: Hexagon, urlPrefix: "/projects/" },
  knowledge: { label: "Knowledge", icon: Brain, urlPrefix: "/knowledge/" },
  run: { label: "Runs", icon: Play, urlPrefix: "/runs/" },
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue, openNewAgent } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const searchQuery = query.trim();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
        if (isMobile) setSidebarOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, setSidebarOpen]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: searchResults = [] } = useQuery({
    queryKey: queryKeys.search.query(selectedCompanyId!, searchQuery),
    queryFn: () => searchApi.search(selectedCompanyId!, searchQuery),
    enabled: !!selectedCompanyId && open && searchQuery.length > 1,
    placeholderData: (prev) => prev,
  });

  // Group results by type
  const grouped = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  const showResults = searchQuery.length > 1 && searchResults.length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && isMobile) setSidebarOpen(false);
      }}
    >
      <CommandInput
        placeholder="Search issues, agents, projects, knowledge, runs..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {!showResults && (
          <>
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  openNewIssue();
                }}
              >
                <SquarePen className="mr-2 h-4 w-4" />
                Create new issue
                <span className="ml-auto text-xs text-muted-foreground">C</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  openNewAgent();
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create new agent
              </CommandItem>
              <CommandItem onSelect={() => go("/projects")}>
                <Plus className="mr-2 h-4 w-4" />
                Create new project
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Pages">
              <CommandItem onSelect={() => go("/dashboard")}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </CommandItem>
              <CommandItem onSelect={() => go("/inbox")}>
                <Inbox className="mr-2 h-4 w-4" />
                Inbox
              </CommandItem>
              <CommandItem onSelect={() => go("/issues")}>
                <CircleDot className="mr-2 h-4 w-4" />
                Issues
              </CommandItem>
              <CommandItem onSelect={() => go("/projects")}>
                <Hexagon className="mr-2 h-4 w-4" />
                Projects
              </CommandItem>
              <CommandItem onSelect={() => go("/goals")}>
                <Target className="mr-2 h-4 w-4" />
                Goals
              </CommandItem>
              <CommandItem onSelect={() => go("/agents")}>
                <Bot className="mr-2 h-4 w-4" />
                Agents
              </CommandItem>
              <CommandItem onSelect={() => go("/costs")}>
                <DollarSign className="mr-2 h-4 w-4" />
                Costs
              </CommandItem>
              <CommandItem onSelect={() => go("/activity")}>
                <History className="mr-2 h-4 w-4" />
                Activity
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {showResults &&
          (Object.entries(grouped) as [SearchResult["type"], SearchResult[]][]).map(
            ([type, items]) => {
              const config = TYPE_CONFIG[type];
              const Icon = config.icon;
              return (
                <div key={type}>
                  <CommandSeparator />
                  <CommandGroup heading={config.label}>
                    {items.slice(0, 5).map((item) => (
                      <CommandItem
                        key={`${type}-${item.id}`}
                        value={`${searchQuery} ${item.title} ${item.subtitle ?? ""}`}
                        onSelect={() => go(`${config.urlPrefix}${item.id}`)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <span className="flex-1 truncate">{item.title}</span>
                        {item.subtitle && (
                          <span className="ml-2 text-xs text-muted-foreground truncate max-w-[150px]">
                            {item.subtitle}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              );
            },
          )}
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/CommandPalette.tsx
git commit -m "feat(ui): replace CommandPalette with unified global search"
```

---

## Task 6: Company Brain — Service

**Files:**
- Create: `server/src/services/brain.ts`

- [ ] **Step 1: Create the brain service**

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sql, eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { knowledgeEntries } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

const GEMINI_MODEL = "gemini-2.5-flash-lite";

interface ExtractedFact {
  title: string;
  content: string;
  category: string;
  tags: string[];
}

interface RunContext {
  id: string;
  companyId: string;
  agentId: string;
  agentName?: string;
  agentRole?: string;
  stdoutExcerpt?: string | null;
  resultJson?: Record<string, unknown> | null;
  contextSnapshot?: Record<string, unknown> | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  usageJson?: Record<string, unknown> | null;
}

interface BrainThresholds {
  minDurationSeconds: number;
  minCostCents: number;
  autoExtractRoles: string[];
}

const DEFAULT_THRESHOLDS: BrainThresholds = {
  minDurationSeconds: 120,
  minCostCents: 50, // $0.50
  autoExtractRoles: ["ceo", "researcher", "lead"],
};

function getGeminiClient(): GoogleGenerativeAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "your-gemini-api-key-here") return null;
  return new GoogleGenerativeAI(apiKey);
}

function extractJsonArray(text: string): unknown[] {
  const cleaned = text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
  return parsed;
}

const EXTRACTION_PROMPT = `Analyze the following agent execution transcript and extract reusable facts
that would help OTHER agents working on similar tasks in the future.

Agent: {agentName} ({agentRole})
Task: {issueTitle} — {issueDescription}
Transcript (excerpt):
{stdoutExcerpt}

Result:
{resultJson}

Extract between 1 and 10 facts. Each fact should be:
- Self-contained (understandable without the original transcript)
- Actionable (useful for a future agent working on a related task)
- Specific (not generic advice like "test your code")

Return ONLY a valid JSON array:
[{"title": "...", "content": "...", "category": "...", "tags": ["..."]}]

Valid categories: technical, process, integration, domain, architecture, debugging`;

export function brainService(db: Db) {
  return {
    /**
     * Evaluate whether a run should trigger automatic knowledge extraction.
     */
    evaluateThreshold: (run: RunContext, thresholds?: Partial<BrainThresholds>): boolean => {
      const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

      // Check duration
      if (run.startedAt && run.finishedAt) {
        const durationMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
        if (durationMs > t.minDurationSeconds * 1000) return true;
      }

      // Check cost
      if (run.usageJson) {
        const totalCents = (run.usageJson as any).totalCostCents ?? 0;
        if (totalCents > t.minCostCents) return true;
      }

      // Check agent role
      if (run.agentRole && t.autoExtractRoles.includes(run.agentRole.toLowerCase())) {
        return true;
      }

      return false;
    },

    /**
     * Extract knowledge facts from a run's transcript using Gemini.
     */
    extractKnowledge: async (run: RunContext): Promise<ExtractedFact[]> => {
      const genAI = getGeminiClient();
      if (!genAI) {
        logger.warn("Brain: Gemini API key not configured, skipping extraction");
        return [];
      }

      const context = run.contextSnapshot as any;
      const issueTitle = context?.issueTitle ?? context?.title ?? "Unknown task";
      const issueDescription = context?.issueDescription ?? context?.description ?? "";

      const prompt = EXTRACTION_PROMPT
        .replace("{agentName}", run.agentName ?? "Unknown")
        .replace("{agentRole}", run.agentRole ?? "general")
        .replace("{issueTitle}", issueTitle)
        .replace("{issueDescription}", issueDescription)
        .replace("{stdoutExcerpt}", (run.stdoutExcerpt ?? "").slice(0, 8000))
        .replace("{resultJson}", JSON.stringify(run.resultJson ?? {}).slice(0, 4000));

      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
      const response = await model.generateContent(prompt);
      const text = response.response.text();
      const rawFacts = extractJsonArray(text);

      return rawFacts.slice(0, 10).map((f: any) => ({
        title: String(f.title ?? "").slice(0, 200),
        content: String(f.content ?? ""),
        category: ["technical", "process", "integration", "domain", "architecture", "debugging"]
          .includes(f.category) ? f.category : "technical",
        tags: Array.isArray(f.tags) ? f.tags.map(String).slice(0, 10) : [],
      }));
    },

    /**
     * Deduplicate and store facts in the knowledge base.
     * If an existing brain_auto entry matches (ts_rank > 0.3), overwrite it.
     * Otherwise, insert a new entry.
     */
    deduplicateAndStore: async (
      facts: ExtractedFact[],
      companyId: string,
      agentId: string,
      runId: string,
      agentName?: string,
    ): Promise<{ created: number; updated: number }> => {
      let created = 0;
      let updated = 0;

      for (const fact of facts) {
        const searchTerms = `${fact.title} ${fact.tags.join(" ")}`
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 8)
          .map((w) => `${w}:*`)
          .join(" & ");

        if (!searchTerms) {
          // No searchable terms, just insert
          await db.insert(knowledgeEntries).values({
            companyId,
            agentId,
            title: fact.title,
            content: fact.content,
            category: fact.category,
            tags: fact.tags,
            pinned: false,
            sourceType: "brain_auto",
            sourceRef: runId,
            metadata: { extracted_from_run: runId, agent_name: agentName },
          });
          created++;
          continue;
        }

        // Search for existing brain_auto entries that match
        const existing = await db
          .select({
            id: knowledgeEntries.id,
            metadata: knowledgeEntries.metadata,
            sourceRef: knowledgeEntries.sourceRef,
            rank: sql<number>`ts_rank(${knowledgeEntries.searchVector}, to_tsquery('english', ${searchTerms}))`.as("rank"),
          })
          .from(knowledgeEntries)
          .where(
            and(
              eq(knowledgeEntries.companyId, companyId),
              eq(knowledgeEntries.sourceType, "brain_auto"),
              sql`${knowledgeEntries.searchVector} @@ to_tsquery('english', ${searchTerms})`,
            ),
          )
          .orderBy(sql`rank DESC`)
          .limit(1);

        const match = existing[0];

        if (match && Number(match.rank) > 0.3) {
          // Overwrite existing entry
          const prevRefs: string[] = ((match.metadata as any)?.superseded_refs ?? []);
          if (match.sourceRef) prevRefs.push(match.sourceRef);

          await db
            .update(knowledgeEntries)
            .set({
              title: fact.title,
              content: fact.content,
              category: fact.category,
              tags: fact.tags,
              sourceRef: runId,
              metadata: {
                extracted_from_run: runId,
                agent_name: agentName,
                superseded_refs: prevRefs.slice(-10),
              },
              updatedAt: new Date(),
            })
            .where(eq(knowledgeEntries.id, match.id));
          updated++;
        } else {
          // Insert new entry
          await db.insert(knowledgeEntries).values({
            companyId,
            agentId,
            title: fact.title,
            content: fact.content,
            category: fact.category,
            tags: fact.tags,
            pinned: false,
            sourceType: "brain_auto",
            sourceRef: runId,
            metadata: { extracted_from_run: runId, agent_name: agentName },
          });
          created++;
        }
      }

      return { created, updated };
    },

    /**
     * Main entry point: maybe extract knowledge from a completed run.
     * Called from heartbeat.completeLocalRun hook.
     * Runs async (fire-and-forget) to not block the heartbeat response.
     */
    maybeExtract: async (run: RunContext, thresholds?: Partial<BrainThresholds>) => {
      try {
        const svc = brainService(db);
        if (!svc.evaluateThreshold(run, thresholds)) return null;

        const facts = await svc.extractKnowledge(run);
        if (facts.length === 0) return null;

        const result = await svc.deduplicateAndStore(
          facts,
          run.companyId,
          run.agentId,
          run.id,
          run.agentName,
        );

        logger.info(
          `Brain: extracted ${result.created} new, ${result.updated} updated facts from run ${run.id}`,
        );
        return result;
      } catch (err) {
        logger.error({ err }, `Brain: failed to extract knowledge from run ${run.id}`);
        return null;
      }
    },

    /**
     * Force extract knowledge from a specific run (manual trigger).
     */
    forceExtract: async (run: RunContext) => {
      try {
        const svc = brainService(db);
        const facts = await svc.extractKnowledge(run);
        if (facts.length === 0) return { created: 0, updated: 0, facts: [] };

        const result = await svc.deduplicateAndStore(
          facts,
          run.companyId,
          run.agentId,
          run.id,
          run.agentName,
        );

        return { ...result, facts };
      } catch (err) {
        logger.error({ err }, `Brain: forced extraction failed for run ${run.id}`);
        throw err;
      }
    },
  };
}
```

- [ ] **Step 2: Export from services index**

Add to `server/src/services/index.ts`:

```typescript
export { brainService } from "./brain.js";
```

- [ ] **Step 3: Commit**

```bash
git add server/src/services/brain.ts server/src/services/index.ts
git commit -m "feat: add Company Brain service with Gemini extraction + deduplication"
```

---

## Task 7: Company Brain — Hook into Heartbeat

**Files:**
- Modify: `server/src/services/heartbeat.ts` (~line 4267-4283)

- [ ] **Step 1: Add brain import**

Add at the top of `server/src/services/heartbeat.ts`, near the other imports:

```typescript
import { brainService as createBrainService } from "./brain.js";
```

- [ ] **Step 2: Add brain hook in completeLocalRun**

Inside the `heartbeatService(db)` function, locate the `completeLocalRun` method. After the block:

```typescript
      const agent = await getAgent(run.agentId);
      if (agent) await finalizeAgentStatus(agent.id, outcome);
      activeRunExecutions.delete(runId);
```

And before `return finalizedRun;`, add the brain hook:

```typescript
      // Company Brain: async knowledge extraction (fire-and-forget)
      if (outcome === "succeeded" && finalizedRun) {
        const brain = createBrainService(db);
        const runForBrain = {
          id: finalizedRun.id,
          companyId: finalizedRun.companyId,
          agentId: finalizedRun.agentId,
          agentName: agent?.name,
          agentRole: agent?.role,
          stdoutExcerpt: finalizedRun.stdoutExcerpt,
          resultJson: finalizedRun.resultJson as Record<string, unknown> | null,
          contextSnapshot: finalizedRun.contextSnapshot as Record<string, unknown> | null,
          startedAt: finalizedRun.startedAt,
          finishedAt: finalizedRun.finishedAt,
          usageJson: finalizedRun.usageJson as Record<string, unknown> | null,
        };
        // Don't await — run in background to not block the response
        brain.maybeExtract(runForBrain).catch(() => {});
      }
```

- [ ] **Step 3: Commit**

```bash
git add server/src/services/heartbeat.ts
git commit -m "feat: hook Company Brain extraction into completeLocalRun"
```

---

## Task 8: Company Brain — Manual Extraction Endpoint

**Files:**
- Modify: `server/src/routes/knowledge.ts`

- [ ] **Step 1: Add manual extract route**

Add to `server/src/routes/knowledge.ts`, after the existing routes and before the `return router;` line.

Add the import at top:

```typescript
import { brainService } from "../services/brain.js";
import { heartbeatRuns, agents } from "@paperclipai/db";
```

Add the route:

```typescript
  // Manual knowledge extraction from a run
  router.post("/companies/:companyId/knowledge/extract-from-run/:runId", async (req, res) => {
    assertCompanyAccess(req, req.params.companyId!);

    const brain = brainService(db);
    const companyId = req.params.companyId!;
    const runId = req.params.runId!;

    // Fetch the run
    const [run] = await db
      .select()
      .from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.companyId, companyId)))
      .limit(1);

    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    // Fetch agent info
    const [agent] = await db
      .select({ name: agents.name, role: agents.role })
      .from(agents)
      .where(eq(agents.id, run.agentId))
      .limit(1);

    const result = await brain.forceExtract({
      id: run.id,
      companyId: run.companyId,
      agentId: run.agentId,
      agentName: agent?.name,
      agentRole: agent?.role,
      stdoutExcerpt: run.stdoutExcerpt,
      resultJson: run.resultJson as Record<string, unknown> | null,
      contextSnapshot: run.contextSnapshot as Record<string, unknown> | null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      usageJson: run.usageJson as Record<string, unknown> | null,
    });

    res.json(result);
  });
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/knowledge.ts
git commit -m "feat: add POST endpoint for manual knowledge extraction from runs"
```

---

## Task 9: Final Integration Commit

- [ ] **Step 1: Verify all files are committed**

```bash
git status
git log --oneline -8
```

Expected: clean working tree, 7 commits for this feature.

- [ ] **Step 2: Verify the build compiles**

```bash
cd /Users/pacosemino/Desktop/Paperclip/paperclip && npx tsc --noEmit -p server/tsconfig.json 2>&1 | head -30
```

Fix any type errors found.

- [ ] **Step 3: Verify UI compiles**

```bash
cd /Users/pacosemino/Desktop/Paperclip/paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | head -30
```

Fix any type errors found.
