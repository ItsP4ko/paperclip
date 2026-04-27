import type { ProjectSprintMetrics, Sprint, SprintMetrics, Issue } from "@paperclipai/shared";
import { api } from "./client";

export interface BoardGroupSprint {
  group: { id: string; name: string } | null;
  sprint: Sprint;
  issues: Issue[];
}

export interface BoardResponse {
  groupSprints: BoardGroupSprint[];
  unassignedIssues: Issue[];
}

export const sprintsApi = {
  listByProject:      (projectId: string) => api.get<Sprint[]>(`/projects/${projectId}/sprints`),
  getActive:          (projectId: string) => api.get<Sprint | null>(`/projects/${projectId}/sprints/active`),
  getProjectMetrics:  (projectId: string) => api.get<ProjectSprintMetrics>(`/projects/${projectId}/sprints/metrics`),
  getBoard:           (projectId: string) => api.get<BoardResponse>(`/projects/${projectId}/sprints/board`),
  create:             (projectId: string, data: { name: string; description?: string; startDate?: string; endDate?: string; groupId: string }) =>
                        api.post<Sprint>(`/projects/${projectId}/sprints`, data),
  get:                (id: string) => api.get<Sprint>(`/sprints/${id}`),
  getMetrics:         (id: string) => api.get<SprintMetrics>(`/sprints/${id}/metrics`),
  update:             (id: string, data: Record<string, unknown>) => api.patch<Sprint>(`/sprints/${id}`, data),
  activate:           (id: string) => api.post<Sprint>(`/sprints/${id}/activate`, {}),
  complete:           (id: string, data: { spillStrategy: "backlog" | "next_sprint"; nextSprintId?: string }) =>
                        api.post<Sprint>(`/sprints/${id}/complete`, data),
  addIssue:           (sprintId: string, issueId: string) => api.post(`/sprints/${sprintId}/issues`, { issueId }),
  removeIssue:        (sprintId: string, issueId: string) => api.delete(`/sprints/${sprintId}/issues/${issueId}`),
  remove:             (id: string) => api.delete<Sprint>(`/sprints/${id}`),
};
