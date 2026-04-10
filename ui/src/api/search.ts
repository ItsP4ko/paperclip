import { api } from "./client";

export interface SearchResult {
  type: "issue" | "agent" | "project" | "knowledge" | "run";
  id: string;
  title: string;
  subtitle: string | null;
  score: number;
}

export const searchApi = {
  search: (companyId: string, q: string, opts?: { types?: string; limit?: number }) => {
    const params = new URLSearchParams({ q });
    if (opts?.types) params.set("types", opts.types);
    if (opts?.limit) params.set("limit", String(opts.limit));
    return api.get<SearchResult[]>(`/companies/${companyId}/search?${params.toString()}`);
  },
};
