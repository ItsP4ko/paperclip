import { api } from "./client";

export interface AuditTimelineItem {
  id: string;
  actorType: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  agentId: string | null;
  runId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditTimelineResponse {
  items: AuditTimelineItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AuditFiltersResponse {
  actions: string[];
  entityTypes: string[];
}

function qs(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][];
  return entries.length ? "?" + new URLSearchParams(entries).toString() : "";
}

export const auditApi = {
  timeline: (
    companyId: string,
    opts?: {
      from?: string;
      to?: string;
      actorType?: string;
      entityType?: string;
      action?: string;
      cursor?: string;
      limit?: string;
    },
  ) =>
    api.get<AuditTimelineResponse>(
      `/companies/${companyId}/audit/timeline${qs({
        from: opts?.from,
        to: opts?.to,
        actorType: opts?.actorType,
        entityType: opts?.entityType,
        action: opts?.action,
        cursor: opts?.cursor,
        limit: opts?.limit,
      })}`,
    ),

  filters: (companyId: string) =>
    api.get<AuditFiltersResponse>(`/companies/${companyId}/audit/filters`),

  exportUrl: (
    companyId: string,
    format: "json" | "csv",
    opts?: { from?: string; to?: string; actorType?: string; entityType?: string },
  ) => {
    const base = (api as unknown as { baseUrl?: string }).baseUrl ?? "";
    return `${base}/companies/${companyId}/audit/export${qs({
      format,
      from: opts?.from,
      to: opts?.to,
      actorType: opts?.actorType,
      entityType: opts?.entityType,
    })}`;
  },
};
