import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { agentsApi } from "../api/agents";
import { dashboardApi } from "../api/dashboard";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { activityApi } from "../api/activity";

const PREFETCH_THROTTLE_MS = 200;
const PREFETCH_STALE_TIME = 2 * 60 * 1000;

type PrefetchFn = (companyId: string) => Array<{ queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }>;

const routePrefetchMap: Record<string, PrefetchFn> = {
  "/dashboard": (cid) => [
    { queryKey: queryKeys.agents.list(cid), queryFn: () => agentsApi.list(cid) },
    { queryKey: queryKeys.dashboard(cid), queryFn: () => dashboardApi.summary(cid) },
    { queryKey: queryKeys.activity(cid), queryFn: () => activityApi.list(cid) },
    { queryKey: queryKeys.issues.list(cid), queryFn: () => issuesApi.list(cid) },
    { queryKey: queryKeys.projects.list(cid), queryFn: () => projectsApi.list(cid) },
  ],
  "/issues": (cid) => [
    { queryKey: queryKeys.agents.list(cid), queryFn: () => agentsApi.list(cid) },
    { queryKey: queryKeys.projects.list(cid), queryFn: () => projectsApi.list(cid) },
    { queryKey: queryKeys.issues.list(cid), queryFn: () => issuesApi.list(cid) },
  ],
  "/agents": (cid) => [
    { queryKey: queryKeys.agents.list(cid), queryFn: () => agentsApi.list(cid) },
    { queryKey: queryKeys.heartbeats(cid), queryFn: () => heartbeatsApi.list(cid) },
  ],
  "/goals": (cid) => [
    { queryKey: queryKeys.projects.list(cid), queryFn: () => projectsApi.list(cid) },
  ],
};

export function usePrefetchRoute() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const lastPrefetch = useRef<Record<string, number>>({});

  return useCallback(
    (route: string) => {
      if (!selectedCompanyId) return;

      const now = Date.now();
      if (now - (lastPrefetch.current[route] ?? 0) < PREFETCH_THROTTLE_MS) return;
      lastPrefetch.current[route] = now;

      const prefetcher = routePrefetchMap[route];
      if (!prefetcher) return;

      for (const { queryKey, queryFn } of prefetcher(selectedCompanyId)) {
        queryClient.prefetchQuery({ queryKey, queryFn, staleTime: PREFETCH_STALE_TIME });
      }
    },
    [queryClient, selectedCompanyId],
  );
}
