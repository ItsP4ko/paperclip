import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accessApi, type CompanyMember } from "../api/access";
import { authApi } from "../api/auth";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Users, User, MoreHorizontal } from "lucide-react";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";

function MemberRow({
  member,
  companyId,
  currentUserId,
  canManage,
}: {
  member: CompanyMember;
  companyId: string;
  currentUserId: string | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: issues = [] } = useQuery({
    queryKey: ["issues", companyId, "by-user", member.principalId],
    queryFn: () => issuesApi.list(companyId, { assigneeUserId: member.principalId }),
    enabled: !!companyId,
  });

  const removeMutation = useMutation({
    mutationFn: () => accessApi.removeMember(companyId, member.principalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.access.members(companyId) }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "suspended") =>
      accessApi.updateMemberStatus(companyId, member.principalId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.access.members(companyId) }),
  });

  const openCount = issues.filter(
    (i) => i.status !== "done" && i.status !== "cancelled"
  ).length;

  const displayName = member.userDisplayName ?? member.userEmail ?? member.principalId.slice(0, 8);
  const isActive = member.status === "active";
  const isSelf = currentUserId === member.principalId;
  const isOwner = member.membershipRole === "owner";
  const showActions = canManage && !isSelf && !isOwner;

  const joinedAt = new Date(member.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{displayName}</span>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
              isActive ? "bg-green-400" : "bg-neutral-400"
            )}
          />
        </div>
        {member.userEmail && member.userEmail !== displayName && (
          <span className="text-xs text-muted-foreground truncate block">{member.userEmail}</span>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-4 shrink-0">
        <span className="text-xs text-muted-foreground capitalize w-16 text-right">
          {member.membershipRole ?? "member"}
        </span>
        <span className="text-xs text-muted-foreground w-24 text-right">{joinedAt}</span>
        <span
          className={cn(
            "text-xs px-1.5 py-0.5 rounded-sm font-medium w-16 text-center",
            isActive
              ? "bg-green-400/10 text-green-400"
              : "bg-neutral-400/10 text-muted-foreground"
          )}
        >
          {isActive ? "Active" : member.status}
        </span>
        <span className="text-xs tabular-nums font-medium w-14 text-right">
          {openCount} open
        </span>
      </div>

      <div className="w-7 shrink-0">
        {showActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isActive ? (
                <DropdownMenuItem
                  onClick={() => statusMutation.mutate("suspended")}
                  disabled={statusMutation.isPending}
                >
                  Suspend
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => statusMutation.mutate("active")}
                  disabled={statusMutation.isPending}
                >
                  Reactivate
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
                className="text-destructive focus:text-destructive"
              >
                Remove from company
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

export function Members() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Members" }]);
  }, [setBreadcrumbs]);

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;

  const { data: members = [], isLoading } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Users} message="Select a company to view members." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const humanMembers = members.filter((m: CompanyMember) => m.principalType === "user");
  const active = humanMembers.filter((m) => m.status === "active");
  const inactive = humanMembers.filter((m) => m.status !== "active");

  // Current user is owner or has manage role
  const currentMember = humanMembers.find((m) => m.principalId === currentUserId);
  const canManage = currentMember?.membershipRole === "owner" || currentMember?.membershipRole === "admin";

  if (humanMembers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        message="No members yet. Invite humans to join the company."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active.length} active · {inactive.length} inactive
          </p>
        </div>
      </div>

      {active.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 px-1 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">Active</h2>
            <span className="text-xs text-muted-foreground">({active.length})</span>
          </div>
          <div className="border border-border divide-y divide-border">
            {active.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                companyId={selectedCompanyId!}
                currentUserId={currentUserId}
                canManage={canManage}
              />
            ))}
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 px-1 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">Inactive</h2>
            <span className="text-xs text-muted-foreground">({inactive.length})</span>
          </div>
          <div className="border border-border divide-y divide-border">
            {inactive.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                companyId={selectedCompanyId!}
                currentUserId={currentUserId}
                canManage={canManage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
