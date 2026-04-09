import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { auditApi, type AuditTimelineItem } from "../api/audit";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Download, ChevronDown, ChevronRight, Bot, User, Cog } from "lucide-react";

const ACTOR_ICONS: Record<string, typeof Bot> = {
  agent: Bot,
  user: User,
  system: Cog,
};

const ACTOR_TYPE_LABELS: Record<string, string> = {
  agent: "Agent",
  user: "User",
  system: "System",
};

/* ── Human-readable action verbs ── */
const ACTION_VERBS: Record<string, string> = {
  "agent.created": "created an agent",
  "agent.updated": "updated an agent",
  "agent.deleted": "deleted an agent",
  "agent.dismissed": "dismissed an agent",
  "agent.started": "started an agent",
  "agent.stopped": "stopped an agent",
  "agent.paused": "paused an agent",
  "agent.resumed": "resumed an agent",
  "issue.created": "created an issue",
  "issue.updated": "updated an issue",
  "issue.deleted": "deleted an issue",
  "issue.assigned": "assigned an issue",
  "issue.read_marked": "marked an issue as read",
  "issue.status_changed": "changed issue status",
  "approval.requested": "requested approval",
  "approval.approved": "approved a request",
  "approval.rejected": "rejected a request",
  "budget.updated": "updated the budget",
  "budget.threshold_reached": "reached budget threshold",
  "cost.recorded": "recorded a cost",
  "company.updated": "updated company settings",
  "routine.created": "created a routine",
  "routine.updated": "updated a routine",
  "routine.deleted": "deleted a routine",
  "routine.triggered": "triggered a routine",
  "heartbeat.received": "sent a heartbeat",
  "heartbeat.missed": "missed a heartbeat",
};

function describeAction(item: AuditTimelineItem): string {
  const verb = ACTION_VERBS[item.action];
  if (verb) return verb;
  // Fallback: "action_name" → "action name"
  const parts = item.action.split(".");
  const actionPart = parts.slice(1).join(" ").replace(/_/g, " ");
  return actionPart || item.action.replace(/[._]/g, " ");
}

/* ── Details: only show human-relevant fields ── */
const HIDDEN_DETAIL_KEYS = new Set([
  "eventId",
  "actorId",
  "actorType",
  "entityId",
  "entityType",
  "agentId",
  "runId",
  "companyId",
  "id",
  "identifier",
  "createdAt",
  "updatedAt",
]);

const DETAIL_LABELS: Record<string, string> = {
  taskId: "Task",
  issueNumber: "Issue",
  costModel: "Model",
  modelName: "Model",
  amount: "Amount",
  status: "Status",
  reason: "Reason",
  description: "Description",
  name: "Name",
  title: "Title",
  label: "Label",
  assignee: "Assignee",
  priority: "Priority",
  sprintName: "Sprint",
  routineName: "Routine",
  threshold: "Threshold",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
  totalCost: "Total cost",
  duration: "Duration",
};

function getVisibleDetails(details: Record<string, unknown> | null): [string, string][] {
  if (!details) return [];
  const result: [string, string][] = [];
  for (const [key, value] of Object.entries(details)) {
    if (HIDDEN_DETAIL_KEYS.has(key)) continue;
    if (value == null || value === "") continue;
    // Skip long UUIDs shown as values
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(value)) continue;
    const label = DETAIL_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()).trim();
    const display = typeof value === "object" ? JSON.stringify(value) : String(value);
    result.push([label, display]);
  }
  return result;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ActionBadge({ action }: { action: string }) {
  const prefix = action.split(".")[0];
  const tones: Record<string, string> = {
    agent: "bg-violet-500/15 text-violet-400 border-violet-500/20",
    issue: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    approval: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    budget: "bg-red-500/15 text-red-400 border-red-500/20",
    cost: "bg-green-500/15 text-green-400 border-green-500/20",
    company: "bg-slate-500/15 text-slate-400 border-slate-500/20",
    routine: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
    heartbeat: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  };
  const tone = tones[prefix] ?? "bg-muted text-muted-foreground border-border";
  return <span className={`inline-block text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${tone}`}>{prefix}</span>;
}

function ActorIcon({ actorType }: { actorType: string }) {
  const Icon = ACTOR_ICONS[actorType] ?? Cog;
  const colors: Record<string, string> = {
    agent: "bg-violet-500/15 text-violet-400",
    user: "bg-blue-500/15 text-blue-400",
    system: "bg-slate-500/15 text-slate-400",
  };
  const color = colors[actorType] ?? "bg-muted text-muted-foreground";
  return (
    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${color}`}>
      <Icon className="h-4 w-4" />
    </div>
  );
}

function AuditRow({ item }: { item: AuditTimelineItem }) {
  const [expanded, setExpanded] = useState(false);
  const visibleDetails = getVisibleDetails(item.details);
  const hasDetails = visibleDetails.length > 0;

  return (
    <div
      className={`px-4 py-3 transition-colors ${hasDetails ? "cursor-pointer hover:bg-muted/30" : ""}`}
      onClick={() => hasDetails && setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3">
        <ActorIcon actorType={item.actorType} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{item.actorName}</span>
            <span className="text-sm text-muted-foreground">{describeAction(item)}</span>
            {item.entityType === "issue" && item.details?.identifier && (
              item.action === "issue.deleted" ? (
                <span className="text-xs font-mono font-medium text-muted-foreground">{String(item.details.identifier)}</span>
              ) : (
                <Link
                  to={`/issues/${item.entityId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-mono font-medium text-blue-400 hover:text-blue-300 hover:underline"
                >
                  {String(item.details.identifier)}
                </Link>
              )
            )}
            <ActionBadge action={item.action} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
          {hasDetails && (
            expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
      {expanded && visibleDetails.length > 0 && (
        <div className="mt-2 ml-11 flex flex-wrap gap-x-4 gap-y-1">
          {visibleDetails.map(([label, value]) => (
            <span key={label} className="text-xs text-muted-foreground">
              <span className="font-medium text-muted-foreground/80">{label}:</span>{" "}
              <span className="text-foreground/70">{value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function AuditLog() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Audit Log" }]); }, [setBreadcrumbs]);

  const [actorType, setActorType] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [items, setItems] = useState<AuditTimelineItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("csv");

  const filterParams = {
    actorType: actorType || undefined,
    entityType: entityType || undefined,
    action: action || undefined,
    cursor,
    limit: "50",
  };

  const filtersQuery = useQuery({
    queryKey: queryKeys.audit.filters(selectedCompanyId!),
    queryFn: () => auditApi.filters(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const timelineQuery = useQuery({
    queryKey: queryKeys.audit.timeline(selectedCompanyId!, filterParams),
    queryFn: () => auditApi.timeline(selectedCompanyId!, filterParams),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (timelineQuery.data) {
      if (cursor) {
        setItems((prev) => [...prev, ...timelineQuery.data.items]);
      } else {
        setItems(timelineQuery.data.items);
      }
      setHasMore(timelineQuery.data.hasMore);
    }
  }, [timelineQuery.data, cursor]);

  const resetAndFetch = useCallback(() => {
    setItems([]);
    setCursor(undefined);
  }, []);

  useEffect(() => { resetAndFetch(); }, [actorType, entityType, action, resetAndFetch]);

  function loadMore() {
    if (timelineQuery.data?.nextCursor) {
      setCursor(timelineQuery.data.nextCursor);
    }
  }

  function handleExport() {
    if (!selectedCompanyId) return;
    const url = auditApi.exportUrl(selectedCompanyId, exportFormat, {
      actorType: actorType || undefined,
      entityType: entityType || undefined,
    });
    window.open(url, "_blank");
  }

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">Activity trail for your workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "json" | "csv")}
            className="text-xs border border-border rounded px-2 py-1 bg-background"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={actorType}
          onChange={(e) => setActorType(e.target.value)}
          className="text-xs border border-border rounded px-2 py-1.5 bg-background min-w-[120px]"
        >
          <option value="">All actors</option>
          <option value="agent">Agent</option>
          <option value="user">User</option>
          <option value="system">System</option>
        </select>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="text-xs border border-border rounded px-2 py-1.5 bg-background min-w-[120px]"
        >
          <option value="">All entities</option>
          {filtersQuery.data?.entityTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="text-xs border border-border rounded px-2 py-1.5 bg-background min-w-[160px]"
        >
          <option value="">All actions</option>
          {filtersQuery.data?.actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {items.length === 0 && !timelineQuery.isLoading && (
          <p className="text-sm text-muted-foreground py-12 text-center">No activity found</p>
        )}
        {items.map((item) => (
          <AuditRow key={item.id} item={item} />
        ))}
        {timelineQuery.isLoading && (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
        )}
      </div>

      {hasMore && !timelineQuery.isLoading && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore}>
            <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
