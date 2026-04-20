import { api } from "./client";

export interface GroupListItem {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  createdByUserId: string;
  memberCount: number;
  projectCount: number;
  projectNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  principalType: string;
  principalId: string;
  role: "member" | "admin";
  addedByUserId: string | null;
  createdAt: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface GroupProject {
  projectId: string;
  addedByUserId: string | null;
  createdAt: string;
  name: string;
  status: string;
}

export interface GroupDetail extends GroupListItem {
  members: GroupMember[];
  projects: GroupProject[];
}

export const groupsApi = {
  list: (companyId: string) =>
    api.get<GroupListItem[]>(`/companies/${companyId}/groups`),

  get: (companyId: string, groupId: string) =>
    api.get<GroupDetail>(`/companies/${companyId}/groups/${groupId}`),

  create: (companyId: string, data: { name: string; description?: string | null }) =>
    api.post<GroupListItem>(`/companies/${companyId}/groups`, data),

  update: (companyId: string, groupId: string, data: { name?: string; description?: string | null }) =>
    api.patch<GroupListItem>(`/companies/${companyId}/groups/${groupId}`, data),

  remove: (companyId: string, groupId: string) =>
    api.delete<void>(`/companies/${companyId}/groups/${groupId}`),

  addMembers: (companyId: string, groupId: string, members: Array<{ principalType: string; principalId: string }>) =>
    api.post<unknown>(`/companies/${companyId}/groups/${groupId}/members`, { members }),

  removeMember: (companyId: string, groupId: string, principalType: string, principalId: string) =>
    api.delete<void>(`/companies/${companyId}/groups/${groupId}/members/${principalType}/${principalId}`),

  updateMemberRole: (companyId: string, groupId: string, principalType: string, principalId: string, role: string) =>
    api.patch<unknown>(`/companies/${companyId}/groups/${groupId}/members/${principalType}/${principalId}`, { role }),

  addProjects: (companyId: string, groupId: string, projectIds: string[]) =>
    api.post<unknown>(`/companies/${companyId}/groups/${groupId}/projects`, { projectIds }),

  removeProject: (companyId: string, groupId: string, projectId: string) =>
    api.delete<void>(`/companies/${companyId}/groups/${groupId}/projects/${projectId}`),

  listForProject: (projectId: string) =>
    api.get<Array<{ id: string; name: string; description: string | null }>>(`/projects/${projectId}/groups`),
};
