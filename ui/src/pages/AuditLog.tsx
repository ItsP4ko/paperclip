import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { auditApi, type AuditTimelineItem } from "../api/audit";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "@/components/ui/button";
import { Download, ChevronDown } from "lucide-react";

const ACTOR_TYPE_LABELS: Record<string, string> = {
  agent: "Agent",
  user: "User",
  system: "System",
};

function formatAction(action: string) {
  return action.replace(/\./g, " \u203a ").replace(/_/g, " ");
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ActionBadge({ action }: { action: string }) {
  const prefix = action.split(".")[0];
  const tones: Record<string, string> = {
    agent: "bg-violet-500/10 text-violet-700",
    issue: "bg-blue-500/10 text-blue-700",
    approval: "bg-amber-500/10 text-amber-700",
    budget: "bg-red-500/10 text-red-700",
    cost: "bg-green-500/10 text-green-700",
    company: "bg-slate-500/10 text-slate-700",
    routine: "bg-cyan-500/10 text-cyan-700",
    heartbeat: "bg-orange-500/10 text-orange-700",
  };
  const tone = tones[prefix] ?? "bg-muted text-muted-foreground";
  return <span className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded ${tone}`}>{prefix}</span>;
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

  // Append new items when data arrives (for pagination)
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

  // Reset pagination when filters change
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
          <p className="text-sm text-muted-foreground mt-1">Complete activity trail for compliance and debugging</p>
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
          <div key={item.id} className="px-4 py-3 flex items-start gap-3">
            <div className="pt-0.5">
              <ActionBadge action={item.action} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium truncate">{item.actorName}</span>
                <span className="text-xs text-muted-foreground">{ACTOR_TYPE_LABELS[item.actorType] ?? item.actorType}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {formatAction(item.action)} on <span className="font-medium text-foreground">{item.entityType}</span>{" "}
                <span className="text-xs font-mono">{item.entityId.slice(0, 8)}</span>
              </p>
              {item.details && Object.keys(item.details).length > 0 && (
                <pre className="mt-1 text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1 overflow-x-auto max-w-full">
                  {JSON.stringify(item.details, null, 2)}
                </pre>
              )}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(item.createdAt)}</span>
          </div>
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
