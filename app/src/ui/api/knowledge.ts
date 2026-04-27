import { api } from "./client";

export interface KnowledgeEntry {
  id: string;
  companyId: string;
  agentId: string | null;
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  pinned: boolean;
  sourceType: string;
  sourceRef: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEntryInput {
  title: string;
  content: string;
  agentId?: string | null;
  category?: string | null;
  tags?: string[];
  pinned?: boolean;
  sourceType?: string;
  sourceRef?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface KnowledgeInjection {
  id: string;
  knowledgeEntryId: string;
  entryTitle: string | null;
  injectedAt: string;
}

function qs(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][];
  return entries.length ? "?" + new URLSearchParams(entries).toString() : "";
}

export const knowledgeApi = {
  list: (
    companyId: string,
    opts?: {
      agentId?: string;
      category?: string;
      pinned?: string;
      limit?: string;
      offset?: string;
    },
  ) =>
    api.get<KnowledgeEntry[]>(
      `/companies/${companyId}/knowledge${qs({
        agentId: opts?.agentId,
        category: opts?.category,
        pinned: opts?.pinned,
        limit: opts?.limit,
        offset: opts?.offset,
      })}`,
    ),

  search: (companyId: string, q: string, opts?: { agentId?: string; limit?: string }) =>
    api.get<KnowledgeEntry[]>(
      `/companies/${companyId}/knowledge/search${qs({
        q,
        agentId: opts?.agentId,
        limit: opts?.limit,
      })}`,
    ),

  categories: (companyId: string) =>
    api.get<string[]>(`/companies/${companyId}/knowledge/categories`),

  getById: (companyId: string, entryId: string) =>
    api.get<KnowledgeEntry>(`/companies/${companyId}/knowledge/${entryId}`),

  create: (companyId: string, input: KnowledgeEntryInput) =>
    api.post<KnowledgeEntry>(`/companies/${companyId}/knowledge`, input),

  update: (companyId: string, entryId: string, input: Partial<KnowledgeEntryInput>) =>
    api.patch<KnowledgeEntry>(`/companies/${companyId}/knowledge/${entryId}`, input),

  delete: (companyId: string, entryId: string) =>
    api.delete<{ ok: boolean }>(`/companies/${companyId}/knowledge/${entryId}`),

  injections: (companyId: string, runId: string) =>
    api.get<KnowledgeInjection[]>(`/companies/${companyId}/knowledge/injections/${runId}`),
};
