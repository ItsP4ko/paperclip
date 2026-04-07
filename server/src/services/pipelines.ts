import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  pipelines,
  pipelineSteps,
  pipelineRuns,
  pipelineRunSteps,
} from "@paperclipai/db";
import { issueService } from "./issues.js";

export function pipelineService(db: Db) {
  const issueSvc = issueService(db);

  async function evaluateReadySteps(runId: string) {
    const runStepRows = await db
      .select({
        runStep: pipelineRunSteps,
        step: pipelineSteps,
      })
      .from(pipelineRunSteps)
      .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
      .where(eq(pipelineRunSteps.pipelineRunId, runId));

    const completedStepIds = new Set(
      runStepRows
        .filter(
          (rs) => rs.runStep.status === "completed" || rs.runStep.status === "skipped",
        )
        .map((rs) => rs.runStep.pipelineStepId),
    );

    const [run] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, runId));
    if (!run) return;

    for (const { runStep, step } of runStepRows) {
      if (runStep.status !== "pending") continue;

      const deps = step.dependsOn ?? [];
      const allDepsCompleted = deps.every((depStepId) => completedStepIds.has(depStepId));
      if (!allDepsCompleted) continue;

      let issueId: string | null = null;
      if (run.projectId) {
        try {
          const issue = await issueSvc.create(run.companyId, {
            projectId: run.projectId,
            title: step.name,
            assigneeAgentId: step.agentId ?? undefined,
            priority: "medium",
            status: "todo",
          });
          issueId = issue.id;
        } catch {
          // proceed without issue
        }
      }

      await db
        .update(pipelineRunSteps)
        .set({
          status: "running",
          startedAt: new Date(),
          ...(issueId ? { issueId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(pipelineRunSteps.id, runStep.id));
    }

    // Re-check if all steps are terminal
    const updatedSteps = await db
      .select()
      .from(pipelineRunSteps)
      .where(eq(pipelineRunSteps.pipelineRunId, runId));

    const allTerminal =
      updatedSteps.length > 0 &&
      updatedSteps.every(
        (rs) =>
          rs.status === "completed" ||
          rs.status === "skipped" ||
          rs.status === "failed",
      );

    if (allTerminal) {
      await db
        .update(pipelineRuns)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRuns.id, runId));
    }
  }

  return {
    list: async (companyId: string) => {
      return db
        .select()
        .from(pipelines)
        .where(eq(pipelines.companyId, companyId))
        .orderBy(pipelines.createdAt);
    },

    getById: async (companyId: string, id: string) => {
      const [pipeline] = await db
        .select()
        .from(pipelines)
        .where(and(eq(pipelines.id, id), eq(pipelines.companyId, companyId)));
      if (!pipeline) return null;
      const steps = await db
        .select()
        .from(pipelineSteps)
        .where(eq(pipelineSteps.pipelineId, id))
        .orderBy(pipelineSteps.position, pipelineSteps.createdAt);
      return { ...pipeline, steps };
    },

    create: async (
      companyId: string,
      data: { name: string; description?: string; status?: string },
    ) => {
      const [pipeline] = await db
        .insert(pipelines)
        .values({ companyId, ...data })
        .returning();
      return pipeline;
    },

    update: async (
      companyId: string,
      id: string,
      data: { name?: string; description?: string; status?: string },
    ) => {
      const [pipeline] = await db
        .update(pipelines)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(pipelines.id, id), eq(pipelines.companyId, companyId)))
        .returning();
      return pipeline ?? null;
    },

    delete: async (companyId: string, id: string) => {
      await db
        .delete(pipelines)
        .where(and(eq(pipelines.id, id), eq(pipelines.companyId, companyId)));
    },

    createStep: async (
      companyId: string,
      pipelineId: string,
      data: {
        name: string;
        agentId?: string | null;
        dependsOn?: string[];
        position?: number;
        config?: Record<string, unknown>;
      },
    ) => {
      const [pipeline] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.id, pipelineId), eq(pipelines.companyId, companyId)));
      if (!pipeline) return null;
      const [step] = await db
        .insert(pipelineSteps)
        .values({
          pipelineId,
          name: data.name,
          agentId: data.agentId ?? null,
          dependsOn: data.dependsOn ?? [],
          position: data.position ?? 0,
          config: data.config ?? {},
        })
        .returning();
      return step;
    },

    updateStep: async (
      companyId: string,
      pipelineId: string,
      stepId: string,
      data: {
        name?: string;
        agentId?: string | null;
        dependsOn?: string[];
        position?: number;
        config?: Record<string, unknown>;
      },
    ) => {
      const [pipeline] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.id, pipelineId), eq(pipelines.companyId, companyId)));
      if (!pipeline) return null;
      const [step] = await db
        .update(pipelineSteps)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.pipelineId, pipelineId)),
        )
        .returning();
      return step ?? null;
    },

    deleteStep: async (companyId: string, pipelineId: string, stepId: string) => {
      const [pipeline] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.id, pipelineId), eq(pipelines.companyId, companyId)));
      if (!pipeline) return;
      await db
        .delete(pipelineSteps)
        .where(
          and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.pipelineId, pipelineId)),
        );
    },

    triggerRun: async (
      companyId: string,
      pipelineId: string,
      opts: { triggeredBy?: string; projectId?: string },
    ) => {
      const [pipeline] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.id, pipelineId), eq(pipelines.companyId, companyId)));
      if (!pipeline) return null;

      const steps = await db
        .select()
        .from(pipelineSteps)
        .where(eq(pipelineSteps.pipelineId, pipelineId))
        .orderBy(pipelineSteps.position);

      const [run] = await db
        .insert(pipelineRuns)
        .values({
          pipelineId,
          companyId,
          projectId: opts.projectId ?? null,
          status: "running",
          triggeredBy: opts.triggeredBy ?? "manual",
          startedAt: new Date(),
        })
        .returning();

      if (steps.length > 0) {
        await db.insert(pipelineRunSteps).values(
          steps.map((step) => ({
            pipelineRunId: run.id,
            pipelineStepId: step.id,
            status: "pending" as const,
          })),
        );
        await evaluateReadySteps(run.id);
      } else {
        await db
          .update(pipelineRuns)
          .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(pipelineRuns.id, run.id));
      }

      const [updatedRun] = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.id, run.id));
      return updatedRun;
    },

    listRuns: async (companyId: string, pipelineId?: string) => {
      const conditions = [eq(pipelineRuns.companyId, companyId)];
      if (pipelineId) {
        conditions.push(eq(pipelineRuns.pipelineId, pipelineId));
      }
      return db
        .select()
        .from(pipelineRuns)
        .where(and(...conditions))
        .orderBy(pipelineRuns.createdAt);
    },

    getRunById: async (companyId: string, runId: string) => {
      const [run] = await db
        .select()
        .from(pipelineRuns)
        .where(and(eq(pipelineRuns.id, runId), eq(pipelineRuns.companyId, companyId)));
      if (!run) return null;

      const stepRows = await db
        .select({
          runStep: pipelineRunSteps,
          step: pipelineSteps,
        })
        .from(pipelineRunSteps)
        .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
        .where(eq(pipelineRunSteps.pipelineRunId, runId))
        .orderBy(pipelineSteps.position);

      return {
        ...run,
        steps: stepRows.map((s) => ({
          ...s.runStep,
          stepName: s.step.name,
          agentId: s.step.agentId,
          dependsOn: s.step.dependsOn,
          position: s.step.position,
        })),
      };
    },

    onIssueStatusChange: async (issueId: string, _companyId: string) => {
      const [runStep] = await db
        .select()
        .from(pipelineRunSteps)
        .where(
          and(
            eq(pipelineRunSteps.issueId, issueId),
            eq(pipelineRunSteps.status, "running"),
          ),
        );
      if (!runStep) return;

      await db
        .update(pipelineRunSteps)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRunSteps.id, runStep.id));

      await evaluateReadySteps(runStep.pipelineRunId);
    },
  };
}
