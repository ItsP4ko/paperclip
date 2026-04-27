import { GoogleGenerativeAI } from "@google/generative-ai";
import { sql, eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { knowledgeEntries } from "@paperclipai/db";
import { logger } from "@/server/logger";

const GEMINI_MODEL = "gemini-2.5-flash-lite";

interface ExtractedFact {
  title: string;
  content: string;
  category: string;
  tags: string[];
}

export interface RunContext {
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
  minCostCents: 50,
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
    evaluateThreshold: (run: RunContext, thresholds?: Partial<BrainThresholds>): boolean => {
      const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

      if (run.startedAt && run.finishedAt) {
        const durationMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
        if (durationMs > t.minDurationSeconds * 1000) return true;
      }

      if (run.usageJson) {
        const totalCents = (run.usageJson as any).totalCostCents ?? 0;
        if (totalCents > t.minCostCents) return true;
      }

      if (run.agentRole && t.autoExtractRoles.includes(run.agentRole.toLowerCase())) {
        return true;
      }

      return false;
    },

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
