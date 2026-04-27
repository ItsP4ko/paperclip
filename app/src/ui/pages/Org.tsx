import { useEffect, useState } from "react";
import { Link } from "@/ui/lib/router";
import { isTauriEnv } from "../lib/platform";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { accessApi, type CompanyMember } from "../api/access";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { ChevronRight, GitBranch, User, Users } from "lucide-react";
import { cn } from "../lib/utils";

function OrgTree({
  nodes,
  depth = 0,
  hrefFn,
  companyId,
}: {
  nodes: OrgNode[];
  depth?: number;
  hrefFn?: (id: string) => string;
  companyId: string;
}) {
  return (
    <div>
      {nodes.map((node) => (
        <OrgTreeNode key={node.id} node={node} depth={depth} hrefFn={hrefFn} companyId={companyId} />
      ))}
    </div>
  );
}

function OrgTreeNode({
  node,
  depth,
  hrefFn,
  companyId,
}: {
  node: OrgNode;
  depth: number;
  hrefFn?: (id: string) => string;
  companyId: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.reports.length > 0;

  const { data: agentIssues = [] } = useQuery({
    queryKey: ["issues", companyId, "by-agent", node.id],
    queryFn: () => issuesApi.list(companyId, { assigneeAgentId: node.id }),
    enabled: !!companyId,
  });
  const openCount = agentIssues.filter(
    (i) => i.status !== "done" && i.status !== "cancelled"
  ).length;

  const rowContent = (
    <>
      {hasChildren ? (
        <button
          className="p-0.5"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <ChevronRight
            className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
          />
        </button>
      ) : (
        <span className="w-4" />
      )}
      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          node.status === "active"
            ? "bg-green-400"
            : node.status === "paused"
              ? "bg-yellow-400"
              : node.status === "pending_approval"
                ? "bg-amber-400"
              : node.status === "error"
                ? "bg-red-400"
                : "bg-neutral-400"
        )}
      />
      <span className="font-medium flex-1">{node.name}</span>
      <span className="text-xs text-muted-foreground">{node.role}</span>
      <span className="text-xs tabular-nums font-medium shrink-0">{openCount} open</span>
      <StatusBadge status={node.status} />
    </>
  );

  const rowClassName = "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors no-underline text-inherit";
  const rowStyle = { paddingLeft: `${depth * 16 + 12}px` };

  return (
    <div>
      {hrefFn ? (
        <Link
          to={hrefFn(node.id)}
          className={cn(rowClassName, "cursor-pointer hover:bg-accent/50")}
          style={rowStyle}
        >
          {rowContent}
        </Link>
      ) : (
        <div className={rowClassName} style={rowStyle}>
          {rowContent}
        </div>
      )}
      {hasChildren && expanded && (
        <OrgTree nodes={node.reports} depth={depth + 1} hrefFn={hrefFn} companyId={companyId} />
      )}
    </div>
  );
}

function MemberWorkloadRow({
  companyId,
  memberId,
  displayName,
  email,
  role,
}: {
  companyId: string;
  memberId: string;
  displayName: string;
  email: string | null;
  role: string;
}) {
  const { data: issues = [] } = useQuery({
    queryKey: ["issues", companyId, "by-user", memberId],
    queryFn: () => issuesApi.list(companyId, { assigneeUserId: memberId }),
    enabled: !!companyId,
  });
  const openCount = issues.filter(
    (i) => i.status !== "done" && i.status !== "cancelled"
  ).length;
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="font-medium flex-1 truncate">{displayName}</span>
      {email && (
        <span className="text-xs text-muted-foreground truncate max-w-40 hidden sm:inline">{email}</span>
      )}
      <span className="text-xs text-muted-foreground capitalize">{role}</span>
      <span className="text-xs tabular-nums font-medium ml-2 shrink-0">
        {openCount} open
      </span>
    </div>
  );
}

export function Org() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Team" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: members = [] } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const humanMembers = members.filter(
    (m: CompanyMember) => m.principalType === "user" && m.status === "active"
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={GitBranch} message="Select a company to view org chart." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && data.length === 0 && humanMembers.length === 0 && (
        <EmptyState
          icon={GitBranch}
          message="No team members yet. Create agents or invite humans to build your team."
        />
      )}

      {data && data.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 px-1">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">AI Agents</h2>
          </div>
          <div className="border border-border py-1">
            <OrgTree nodes={data} hrefFn={isTauriEnv() ? (id) => `/agents/${id}` : undefined} companyId={selectedCompanyId!} />
          </div>
        </div>
      )}

      {humanMembers.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 px-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">Team Members</h2>
          </div>
          <div className="border border-border py-1">
            {humanMembers.map((m) => (
              <MemberWorkloadRow
                key={m.principalId}
                companyId={selectedCompanyId!}
                memberId={m.principalId}
                displayName={m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8)}
                email={m.userEmail}
                role={m.membershipRole}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
