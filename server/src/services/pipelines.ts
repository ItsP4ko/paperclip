import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  pipelines,
  pipelineSteps,
  pipelineRuns,
  pipelineRunSteps,
  issues,
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

      // 1. If the step has a pre-linked issueId, use that issue
      if (step.issueId) {
        issueId = step.issueId;
        try {
          const [existingIssue] = await db
            .select()
            .from(issues)
            .where(eq(issues.id, step.issueId));
          if (existingIssue) {
            const patch: Partial<typeof issues.$inferInsert> = {};
            // Only promote to "todo" if still in "backlog"
            if (existingIssue.status === "backlog") {
              patch.status = "todo";
            }
            // Assign based on assigneeType
            if (step.assigneeType === "agent") {
              patch.assigneeAgentId = step.agentId ?? undefined;
              patch.assigneeUserId = null;
            } else if (step.assigneeType === "user") {
              patch.assigneeUserId = step.assigneeUserId ?? undefined;
              patch.assigneeAgentId = null;
            }
            if (Object.keys(patch).length > 0) {
              await db
                .update(issues)
                .set({ ...patch, updatedAt: new Date() })
                .where(eq(issues.id, step.issueId));
            }
          }
        } catch {
          // proceed without updating the issue
        }
      }
      // 2. If no pre-linked issue and run has a projectId, create new issue
      else if (run.projectId) {
        try {
          const assigneeData: { assigneeAgentId?: string; assigneeUserId?: string } = {};
          if (step.assigneeType === "agent") {
            if (step.agentId) assigneeData.assigneeAgentId = step.agentId;
          } else if (step.assigneeType === "user") {
            if (step.assigneeUserId) assigneeData.assigneeUserId = step.assigneeUserId;
          } else {
            // Backwards compat: no assigneeType but agentId is set
            if (step.agentId) assigneeData.assigneeAgentId = step.agentId;
          }

          const issue = await issueSvc.create(run.companyId, {
            projectId: run.projectId,
            title: step.name,
            ...assigneeData,
            priority: "medium",
            status: "todo",
          });
          issueId = issue.id;
        } catch {
          // proceed without issue
        }
      }

      // 3. Update runStep to "running" with issueId
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

    createFromIssues: async (
      companyId: string,
      data: { name: string; description?: string; issueIds: string[] },
    ) => {
      // Validate all issues exist and belong to company
      const issueRows = await db
        .select()
        .from(issues)
        .where(and(inArray(issues.id, data.issueIds), eq(issues.companyId, companyId)));

      if (issueRows.length !== data.issueIds.length) {
        throw new Error("One or more issues not found or do not belong to this company");
      }

      // Build a lookup map preserving the order from issueIds
      const issueMap = new Map(issueRows.map((i) => [i.id, i]));

      // Create the pipeline
      const [pipeline] = await db
        .insert(pipelines)
        .values({ companyId, name: data.name, description: data.description })
        .returning();

      // Create steps sequentially to get IDs for dependsOn chaining
      const createdSteps: (typeof pipelineSteps.$inferSelect)[] = [];
      for (let idx = 0; idx < data.issueIds.length; idx++) {
        const issue = issueMap.get(data.issueIds[idx])!;
        const assigneeType = issue.assigneeAgentId
          ? "agent"
          : issue.assigneeUserId
            ? "user"
            : null;

        const [step] = await db
          .insert(pipelineSteps)
          .values({
            pipelineId: pipeline.id,
            name: issue.title,
            issueId: issue.id,
            agentId: issue.assigneeAgentId ?? null,
            assigneeUserId: issue.assigneeUserId ?? null,
            assigneeType,
            dependsOn: idx > 0 ? [createdSteps[idx - 1].id] : [],
            position: idx,
            config: {},
          })
          .returning();
        createdSteps.push(step);
      }

      return { ...pipeline, steps: createdSteps };
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
        assigneeType?: "agent" | "user" | null;
        assigneeUserId?: string | null;
        issueId?: string | null;
      },
    ) => {
      // Validate assigneeType constraints
      if (data.assigneeType === "agent" && !data.agentId) {
        throw new Error("agentId is required when assigneeType is 'agent'");
      }
      if (data.assigneeType === "user" && !data.assigneeUserId) {
        throw new Error("assigneeUserId is required when assigneeType is 'user'");
      }
      // Validate issueId belongs to same company
      if (data.issueId) {
        const [issue] = await db
          .select({ id: issues.id })
          .from(issues)
          .where(and(eq(issues.id, data.issueId), eq(issues.companyId, companyId)));
        if (!issue) {
          throw new Error("Issue not found or does not belong to this company");
        }
      }
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
          assigneeType: data.assigneeType ?? null,
          assigneeUserId: data.assigneeUserId ?? null,
          issueId: data.issueId ?? null,
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
        assigneeType?: "agent" | "user" | null;
        assigneeUserId?: string | null;
        issueId?: string | null;
      },
    ) => {
      const [pipeline] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.id, pipelineId), eq(pipelines.companyId, companyId)));
      if (!pipeline) return null;

      // For partial updates, fetch existing step to validate against combined state
      if (data.assigneeType !== undefined || data.agentId !== undefined || data.assigneeUserId !== undefined) {
        const [existing] = await db
          .select()
          .from(pipelineSteps)
          .where(and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.pipelineId, pipelineId)));
        if (existing) {
          const effectiveAssigneeType = data.assigneeType !== undefined ? data.assigneeType : existing.assigneeType;
          const effectiveAgentId = data.agentId !== undefined ? data.agentId : existing.agentId;
          const effectiveAssigneeUserId = data.assigneeUserId !== undefined ? data.assigneeUserId : existing.assigneeUserId;
          if (effectiveAssigneeType === "agent" && !effectiveAgentId) {
            throw new Error("agentId is required when assigneeType is 'agent'");
          }
          if (effectiveAssigneeType === "user" && !effectiveAssigneeUserId) {
            throw new Error("assigneeUserId is required when assigneeType is 'user'");
          }
        }
      }

      // Validate issueId belongs to same company
      if (data.issueId) {
        const [issue] = await db
          .select({ id: issues.id })
          .from(issues)
          .where(and(eq(issues.id, data.issueId), eq(issues.companyId, companyId)));
        if (!issue) {
          throw new Error("Issue not found or does not belong to this company");
        }
      }

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
          assigneeType: s.step.assigneeType,
          assigneeUserId: s.step.assigneeUserId,
          issueId: s.runStep.issueId ?? s.step.issueId,
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
