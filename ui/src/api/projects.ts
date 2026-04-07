import type { Project, ProjectWorkspace, WorkspaceOperation } from "@paperclipai/shared";
import { api } from "./client";

function withCompanyScope(path: string, companyId?: string) {
  if (!companyId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
}

function projectPath(id: string, companyId?: string, suffix = "") {
  return withCompanyScope(`/projects/${encodeURIComponent(id)}${suffix}`, companyId);
}

export const projectsApi = {
  list: (companyId: string) => api.get<Project[]>(`/companies/${companyId}/projects`),
  get: (id: string, companyId?: string) => api.get<Project>(projectPath(id, companyId)),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Project>(`/companies/${companyId}/projects`, data),
  update: (id: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<Project>(projectPath(id, companyId), data),
  listWorkspaces: (projectId: string, companyId?: string) =>
    api.get<ProjectWorkspace[]>(projectPath(projectId, companyId, "/workspaces")),
  createWorkspace: (projectId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectWorkspace>(projectPath(projectId, companyId, "/workspaces"), data),
  updateWorkspace: (projectId: string, workspaceId: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<ProjectWorkspace>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`),
      data,
    ),
  controlWorkspaceRuntimeServices: (
    projectId: string,
    workspaceId: string,
    action: "start" | "stop" | "restart",
    companyId?: string,
  ) =>
    api.post<{ workspace: ProjectWorkspace; operation: WorkspaceOperation }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/runtime-services/${action}`),
      {},
    ),
  removeWorkspace: (projectId: string, workspaceId: string, companyId?: string) =>
    api.delete<ProjectWorkspace>(projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`)),
  getMemberLocalFolder: (projectId: string, companyId?: string) =>
    api.get<{ cwd: string | null }>(projectPath(projectId, companyId, "/member-local-folder")),
  setMemberLocalFolder: (projectId: string, cwd: string, companyId?: string) =>
    api.put<{ id: string; cwd: string }>(projectPath(projectId, companyId, "/member-local-folder"), { cwd }),
  deleteMemberLocalFolder: (projectId: string, companyId?: string) =>
    api.delete<void>(projectPath(projectId, companyId, "/member-local-folder")),
  remove: (id: string, companyId?: string) => api.delete<Project>(projectPath(id, companyId)),
  getClaudeMd: (id: string, companyId?: string) =>
    api.get<{ content: string }>(projectPath(id, companyId, "/claude-md")),
  updateClaudeMd: (id: string, content: string, companyId?: string) =>
    api.put<{ content: string }>(projectPath(id, companyId, "/claude-md"), { content }),
};
