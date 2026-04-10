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

  function evaluateCondition(
    condition: { field: string; operator: string; value: unknown } | null,
    context: Record<string, unknown>,
  ): boolean {
    if (!condition) return true;
    const fieldValue = context[condition.field];
    switch (condition.operator) {
      case "eq": return fieldValue === condition.value;
      case "neq": return fieldValue !== condition.value;
      case "in": return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      case "not_in": return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
      default: return false;
    }
  }

  async function cascadeSkip(runId: string, stepIdsToSkip: string[]) {
    if (stepIdsToSkip.length === 0) return;
    for (const stepId of stepIdsToSkip) {
      await db
        .update(pipelineRunSteps)
        .set({ status: "skipped", completedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(pipelineRunSteps.pipelineRunId, runId),
          eq(pipelineRunSteps.pipelineStepId, stepId),
          eq(pipelineRunSteps.status, "pending"),
        ));
    }
    // Find downstream dependents that only depend on skipped steps
    const allRunSteps = await db
      .select({ runStep: pipelineRunSteps, step: pipelineSteps })
      .from(pipelineRunSteps)
      .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
      .where(eq(pipelineRunSteps.pipelineRunId, runId));
    const skippedSet = new Set(stepIdsToSkip);
    const nextToSkip: string[] = [];
    for (const { runStep, step } of allRunSteps) {
      if (runStep.status !== "pending") continue;
      const deps = step.dependsOn ?? [];
      if (deps.length === 0) continue;
      const allDepsSkipped = deps.every((d) => skippedSet.has(d) ||
        allRunSteps.find((r) => r.runStep.pipelineStepId === d && r.runStep.status === "skipped"));
      if (allDepsSkipped) nextToSkip.push(step.id);
    }
    if (nextToSkip.length > 0) await cascadeSkip(runId, nextToSkip);
  }

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

      // Handle if/else steps
      if (step.stepType === "if_else") {
        const config = step.config as { branches?: Array<{ id: string; label: string; condition: { field: string; operator: string; value: unknown } | null; nextStepIds: string[] }> };
        const branches = config.branches ?? [];

        // Build context from predecessor's issue
        let context: Record<string, unknown> = { projectId: run.projectId, triggeredBy: run.triggeredBy };
        const completedPredecessors = runStepRows.filter(
          (r) => r.runStep.status === "completed" && r.runStep.issueId && (step.dependsOn ?? []).includes(r.step.id),
        );
        if (completedPredecessors.length > 0) {
          const predIssueId = completedPredecessors[completedPredecessors.length - 1].runStep.issueId;
          if (predIssueId) {
            const [predIssue] = await db.select().from(issues).where(eq(issues.id, predIssueId));
            if (predIssue) {
              context = { ...context, status: predIssue.status, priority: predIssue.priority, assigneeAgentId: predIssue.assigneeAgentId, assigneeUserId: predIssue.assigneeUserId };
            }
          }
        }

        // Evaluate - first matching condition wins, null = else fallback
        let winningIdx = -1;
        for (let i = 0; i < branches.length; i++) {
          if (branches[i].condition === null) continue;
          if (evaluateCondition(branches[i].condition, context)) { winningIdx = i; break; }
        }
        if (winningIdx === -1) winningIdx = branches.findIndex((b) => b.condition === null);

        // Mark if/else as completed
        await db.update(pipelineRunSteps)
          .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(pipelineRunSteps.id, runStep.id));
        completedStepIds.add(step.id);

        // Skip losing branches
        const losingStepIds: string[] = [];
        for (let i = 0; i < branches.length; i++) {
          if (i !== winningIdx) losingStepIds.push(...(branches[i].nextStepIds ?? []));
        }
        if (losingStepIds.length > 0) await cascadeSkip(runId, losingStepIds);
        continue;
      }

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
            if (existingIssue.status === "backlog" || existingIssue.status === "todo") {
              patch.status = "in_progress";
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
            status: "in_progress",
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

      // Mark pipeline as completed
      if (run) {
        await db
          .update(pipelines)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(pipelines.id, run.pipelineId));
      }
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
        positionX?: number | null;
        positionY?: number | null;
        stepType?: "action" | "if_else" | null;
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
          positionX: data.positionX ?? null,
          positionY: data.positionY ?? null,
          stepType: data.stepType ?? "action",
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
        positionX?: number | null;
        positionY?: number | null;
        stepType?: "action" | "if_else" | null;
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

      const { stepType, ...rest } = data;
      const setData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (stepType !== undefined && stepType !== null) setData.stepType = stepType;
      const [step] = await db
        .update(pipelineSteps)
        .set(setData)
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

    batchUpdatePositions: async (
      companyId: string,
      pipelineId: string,
      positions: Array<{ stepId: string; positionX: number; positionY: number }>,
    ) => {
      const [pipeline] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.id, pipelineId), eq(pipelines.companyId, companyId)));
      if (!pipeline) return;
      for (const pos of positions) {
        await db
          .update(pipelineSteps)
          .set({ positionX: pos.positionX, positionY: pos.positionY, updatedAt: new Date() })
          .where(and(eq(pipelineSteps.id, pos.stepId), eq(pipelineSteps.pipelineId, pipelineId)));
      }
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

      if (steps.length === 0) {
        throw new Error("Pipeline has no steps");
      }
      const unassigned = steps.filter(s => !s.assigneeType);
      if (unassigned.length > 0) {
        throw new Error(`All steps must have an assignee. Unassigned: ${unassigned.map(s => s.name).join(", ")}`);
      }

      // Mark pipeline as running
      await db
        .update(pipelines)
        .set({ status: "running", updatedAt: new Date() })
        .where(eq(pipelines.id, pipelineId));

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
          stepType: s.step.stepType,
          positionX: s.step.positionX,
          positionY: s.step.positionY,
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
      if (!runStep) return null;

      await db
        .update(pipelineRunSteps)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRunSteps.id, runStep.id));

      await evaluateReadySteps(runStep.pipelineRunId);
      return runStep.pipelineRunId;
    },

    completeRunStep: async (companyId: string, runId: string, runStepId: string, userId: string) => {
      // Verify run belongs to company
      const [run] = await db
        .select()
        .from(pipelineRuns)
        .where(and(eq(pipelineRuns.id, runId), eq(pipelineRuns.companyId, companyId)));
      if (!run) return null;

      // Get the run step with its pipeline step
      const [runStepRow] = await db
        .select({ runStep: pipelineRunSteps, step: pipelineSteps })
        .from(pipelineRunSteps)
        .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
        .where(and(eq(pipelineRunSteps.id, runStepId), eq(pipelineRunSteps.pipelineRunId, runId)));
      if (!runStepRow) return null;
      if (runStepRow.runStep.status !== "running") return null;

      // Verify the user is the assignee
      if (runStepRow.step.assigneeType !== "user" || runStepRow.step.assigneeUserId !== userId) {
        return null;
      }

      // If there's a linked issue, mark it as done
      if (runStepRow.runStep.issueId) {
        await db
          .update(issues)
          .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(issues.id, runStepRow.runStep.issueId));
      }

      // Mark the run step as completed
      await db
        .update(pipelineRunSteps)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRunSteps.id, runStepId));

      // Cascade to next steps
      await evaluateReadySteps(runId);
      return runId;
    },
  };
}
