import type { Sprint, SprintMetrics } from "@paperclipai/shared";
import { api } from "./client";

export const sprintsApi = {
  list: (companyId: string) => api.get<Sprint[]>(`/companies/${companyId}/sprints`),
  getActive: (companyId: string) => api.get<Sprint | null>(`/companies/${companyId}/sprints/active`),
  get: (id: string) => api.get<Sprint>(`/sprints/${id}`),
  getMetrics: (id: string) => api.get<SprintMetrics>(`/sprints/${id}/metrics`),
  create: (companyId: string, data: { name: string; description?: string; startDate?: string; endDate?: string }) =>
    api.post<Sprint>(`/companies/${companyId}/sprints`, data),
  update: (id: string, data: Record<string, unknown>) => api.patch<Sprint>(`/sprints/${id}`, data),
  activate: (id: string) => api.post<Sprint>(`/sprints/${id}/activate`, {}),
  complete: (id: string, data: { spillStrategy: "backlog" | "next_sprint"; nextSprintId?: string }) =>
    api.post<Sprint>(`/sprints/${id}/complete`, data),
  addIssue: (sprintId: string, issueId: string) =>
    api.post(`/sprints/${sprintId}/issues`, { issueId }),
  removeIssue: (sprintId: string, issueId: string) =>
    api.delete(`/sprints/${sprintId}/issues/${issueId}`),
  remove: (id: string) => api.delete<Sprint>(`/sprints/${id}`),
};
