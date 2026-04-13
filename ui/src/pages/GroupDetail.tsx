import { useState } from "react";
import { useParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus, FolderPlus, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { useCompany } from "../context/CompanyContext";
import { useMemberRole } from "../hooks/useMemberRole";
import { groupsApi, type GroupMember } from "../api/groups";
import { accessApi } from "../api/access";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";

export function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { selectedCompanyId } = useCompany();
  const { isOwner } = useMemberRole(selectedCompanyId);
  const queryClient = useQueryClient();

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const detailKey = queryKeys.groups.detail(selectedCompanyId!, groupId!);

  const { data: group, isLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () => groupsApi.get(selectedCompanyId!, groupId!),
    enabled: !!selectedCompanyId && !!groupId,
  });

  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId && addMemberOpen,
  });

  const { data: companyProjects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && addProjectOpen,
  });

  const addMember = useMutation({
    mutationFn: (principalId: string) =>
      groupsApi.addMembers(selectedCompanyId!, groupId!, [{ principalType: "user", principalId }]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey });
      setSelectedMemberId("");
      setAddMemberOpen(false);
    },
  });

  const removeMember = useMutation({
    mutationFn: (member: GroupMember) =>
      groupsApi.removeMember(selectedCompanyId!, groupId!, member.principalType, member.principalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  const updateRole = useMutation({
    mutationFn: ({ member, role }: { member: GroupMember; role: string }) =>
      groupsApi.updateMemberRole(selectedCompanyId!, groupId!, member.principalType, member.principalId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  const addProject = useMutation({
    mutationFn: (projectId: string) =>
      groupsApi.addProjects(selectedCompanyId!, groupId!, [projectId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey });
      setSelectedProjectId("");
      setAddProjectOpen(false);
    },
  });

  const removeProject = useMutation({
    mutationFn: (projectId: string) =>
      groupsApi.removeProject(selectedCompanyId!, groupId!, projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  const canManage = isOwner;

  if (isLoading) return <PageSkeleton />;
  if (!group) return <EmptyState icon={User} message="Group not found." />;

  const existingMemberIds = new Set(group.members.map((m) => m.principalId));
  const availableMembers = (companyMembers ?? []).filter(
    (m) => m.principalType === "user" && !existingMemberIds.has(m.principalId),
  );
  const existingProjectIds = new Set(group.projects.map((p) => p.projectId));
  const availableProjects = (companyProjects ?? []).filter((p) => !existingProjectIds.has(p.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{group.name}</h1>
        {group.description && (
          <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
        )}
      </div>

      {/* Members */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium">Members ({group.members.length})</CardTitle>
          {canManage && (
            <Button size="xs" variant="outline" onClick={() => setAddMemberOpen(!addMemberOpen)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {addMemberOpen && (
            <div className="flex gap-2 pb-2 border-b border-border mb-2">
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Select member..." />
                </SelectTrigger>
                <SelectContent>
                  {availableMembers.map((m) => (
                    <SelectItem key={m.principalId} value={m.principalId}>
                      {m.userDisplayName ?? m.userEmail ?? m.principalId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="xs"
                disabled={!selectedMemberId || addMember.isPending}
                onClick={() => addMember.mutate(selectedMemberId)}
              >
                Add
              </Button>
            </div>
          )}

          {group.members.length === 0 ? (
            <p className="text-xs text-muted-foreground">No members yet.</p>
          ) : (
            group.members.map((member) => (
              <div
                key={`${member.principalType}:${member.principalId}`}
                className="flex items-center justify-between py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{member.name ?? member.email ?? member.principalId}</span>
                  {member.role === "admin" && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      <Shield className="h-3 w-3 mr-0.5" /> admin
                    </Badge>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    {isOwner && (
                      <Select
                        value={member.role}
                        onValueChange={(role) => updateRole.mutate({ member, role })}
                      >
                        <SelectTrigger className="h-6 w-20 text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">member</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive h-6 w-6 p-0"
                      onClick={() => removeMember.mutate(member)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Projects */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium">Projects ({group.projects.length})</CardTitle>
          {canManage && (
            <Button size="xs" variant="outline" onClick={() => setAddProjectOpen(!addProjectOpen)}>
              <FolderPlus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {addProjectOpen && (
            <div className="flex gap-2 pb-2 border-b border-border mb-2">
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="xs"
                disabled={!selectedProjectId || addProject.isPending}
                onClick={() => addProject.mutate(selectedProjectId)}
              >
                Add
              </Button>
            </div>
          )}

          {group.projects.length === 0 ? (
            <p className="text-xs text-muted-foreground">No projects associated.</p>
          ) : (
            group.projects.map((project) => (
              <div
                key={project.projectId}
                className="flex items-center justify-between py-1.5"
              >
                <div className="min-w-0">
                  <span className="text-sm truncate">{project.name}</span>
                  <Badge variant="outline" className="ml-2 text-[10px]">{project.status}</Badge>
                </div>
                {canManage && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-destructive h-6 w-6 p-0 shrink-0"
                    onClick={() => removeProject.mutate(project.projectId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
