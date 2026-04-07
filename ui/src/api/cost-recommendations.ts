import { api } from "./client";

export interface CostRecommendation {
  id: string;
  companyId: string;
  agentId: string | null;
  type: "downgrade_model" | "pause_idle" | "switch_adapter" | "high_failure_rate" | "budget_underutilized";
  severity: "low" | "medium" | "high";
  estimatedSavingsCents: number;
  status: "pending" | "accepted" | "dismissed";
  details: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function qs(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][];
  return entries.length ? "?" + new URLSearchParams(entries).toString() : "";
}

export const costRecommendationsApi = {
  list: (companyId: string, opts?: { status?: string; limit?: string; offset?: string }) =>
    api.get<CostRecommendation[]>(
      `/companies/${companyId}/cost-recommendations${qs({
        status: opts?.status,
        limit: opts?.limit,
        offset: opts?.offset,
      })}`,
    ),

  generate: (companyId: string) =>
    api.post<{ generated: number }>(
      `/companies/${companyId}/cost-recommendations/generate`,
      {},
    ),

  update: (companyId: string, id: string, status: "accepted" | "dismissed") =>
    api.patch<CostRecommendation>(
      `/companies/${companyId}/cost-recommendations/${id}`,
      { status },
    ),
};
