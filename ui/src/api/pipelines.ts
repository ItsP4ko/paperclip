import { api } from "./client";

export interface Pipeline {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineStep {
  id: string;
  pipelineId: string;
  name: string;
  agentId: string | null;
  assigneeType: "agent" | "user" | null;
  assigneeUserId: string | null;
  issueId: string | null;
  dependsOn: string[];
  config: Record<string, unknown>;
  position: number;
  positionX: number | null;
  positionY: number | null;
  stepType: "action" | "if_else";
  createdAt: string;
  updatedAt: string;
}

export interface PipelineWithSteps extends Pipeline {
  steps: PipelineStep[];
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  companyId: string;
  projectId: string | null;
  status: "running" | "completed" | "failed";
  triggeredBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineRunStep {
  id: string;
  pipelineRunId: string;
  pipelineStepId: string;
  issueId: string | null;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  stepName: string;
  agentId: string | null;
  assigneeType: "agent" | "user" | null;
  assigneeUserId: string | null;
  dependsOn: string[];
  position: number;
  positionX: number | null;
  positionY: number | null;
  stepType: "action" | "if_else";
  createdAt: string;
  updatedAt: string;
}

export interface PipelineRunWithSteps extends PipelineRun {
  steps: PipelineRunStep[];
}

export const pipelinesApi = {
  list: (companyId: string) =>
    api.get<Pipeline[]>(`/companies/${companyId}/pipelines`),

  get: (companyId: string, pipelineId: string) =>
    api.get<PipelineWithSteps>(`/companies/${companyId}/pipelines/${pipelineId}`),

  create: (companyId: string, data: { name: string; description?: string; status?: string }) =>
    api.post<Pipeline>(`/companies/${companyId}/pipelines`, data),

  update: (
    companyId: string,
    pipelineId: string,
    data: { name?: string; description?: string; status?: string },
  ) => api.patch<Pipeline>(`/companies/${companyId}/pipelines/${pipelineId}`, data),

  delete: (companyId: string, pipelineId: string) =>
    api.delete<void>(`/companies/${companyId}/pipelines/${pipelineId}`),

  createFromIssues: (
    companyId: string,
    data: { name: string; description?: string; issueIds: string[] },
  ) => api.post<PipelineWithSteps>(`/companies/${companyId}/pipelines/from-issues`, data),

  createStep: (
    companyId: string,
    pipelineId: string,
    data: {
      name: string;
      agentId?: string | null;
      assigneeType?: "agent" | "user";
      assigneeUserId?: string | null;
      issueId?: string | null;
      dependsOn?: string[];
      position?: number;
      positionX?: number;
      positionY?: number;
      stepType?: "action" | "if_else";
      config?: Record<string, unknown>;
    },
  ) => api.post<PipelineStep>(`/companies/${companyId}/pipelines/${pipelineId}/steps`, data),

  updateStep: (
    companyId: string,
    pipelineId: string,
    stepId: string,
    data: {
      name?: string;
      agentId?: string | null;
      assigneeType?: "agent" | "user";
      assigneeUserId?: string | null;
      issueId?: string | null;
      dependsOn?: string[];
      position?: number;
      positionX?: number;
      positionY?: number;
      stepType?: "action" | "if_else";
      config?: Record<string, unknown>;
    },
  ) =>
    api.patch<PipelineStep>(
      `/companies/${companyId}/pipelines/${pipelineId}/steps/${stepId}`,
      data,
    ),

  deleteStep: (companyId: string, pipelineId: string, stepId: string) =>
    api.delete<void>(
      `/companies/${companyId}/pipelines/${pipelineId}/steps/${stepId}`,
    ),

  batchUpdatePositions: (
    companyId: string,
    pipelineId: string,
    positions: Array<{ stepId: string; positionX: number; positionY: number }>,
  ) =>
    api.patch<{ updated: number }>(
      `/companies/${companyId}/pipelines/${pipelineId}/steps/positions`,
      { positions },
    ),

  triggerRun: (
    companyId: string,
    pipelineId: string,
    data?: { projectId?: string; triggeredBy?: string },
  ) =>
    api.post<PipelineRun>(
      `/companies/${companyId}/pipelines/${pipelineId}/run`,
      data ?? {},
    ),

  listRuns: (companyId: string, pipelineId?: string) =>
    api.get<PipelineRun[]>(
      `/companies/${companyId}/pipeline-runs${pipelineId ? `?pipelineId=${pipelineId}` : ""}`,
    ),

  getRun: (companyId: string, runId: string) =>
    api.get<PipelineRunWithSteps>(`/companies/${companyId}/pipeline-runs/${runId}`),

  completeRunStep: (companyId: string, runId: string, runStepId: string) =>
    api.post<{ completed: boolean }>(`/companies/${companyId}/pipeline-runs/${runId}/steps/${runStepId}/complete`, {}),
};
