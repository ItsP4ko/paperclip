import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { Plus, UsersRound, Folders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useMemberRole } from "../hooks/useMemberRole";
import { groupsApi } from "../api/groups";
import { queryKeys } from "../lib/queryKeys";

export function Groups() {
  const { selectedCompanyId } = useCompany();
  const { openNewGroup } = useDialog();
  const { isOwner } = useMemberRole(selectedCompanyId);

  const { data: groups, isLoading } = useQuery({
    queryKey: queryKeys.groups.list(selectedCompanyId!),
    queryFn: () => groupsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={UsersRound} message="Select a company to view groups." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Groups</h1>
        {isOwner && (
          <Button size="sm" onClick={openNewGroup}>
            <Plus className="h-4 w-4 mr-1" /> New Group
          </Button>
        )}
      </div>

      {!groups || groups.length === 0 ? (
        <EmptyState icon={UsersRound} message="No groups yet." />
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="block">
              <Card className="hover:bg-accent/30 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{group.name}</div>
                    {group.description && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{group.description}</div>
                    )}
                  </div>
                  <div className="flex items-start gap-2 shrink-0 ml-4">
                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                      <UsersRound className="h-3 w-3" />
                      {group.memberCount}
                    </Badge>
                    <div className="flex flex-col items-end">
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Folders className="h-3 w-3" />
                        {group.projectCount}
                      </Badge>
                      {group.projectCount > 0 && group.projectNames.length > 0 && (
                        <span className="mt-0.5 truncate max-w-[12ch] text-[10px] text-muted-foreground">
                          {group.projectNames[0]}
                          {group.projectCount > 1 && ` +${group.projectCount - 1}`}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
