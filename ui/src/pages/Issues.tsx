import { useEffect, useMemo, useCallback } from "react";
import { useLocation, useSearchParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { applyOptimisticIssuePatch, mergeIssueInList } from "../lib/optimistic-issue-mutations";
import type { Issue } from "@paperclipai/shared";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { EmptyState } from "../components/EmptyState";
import { IssuesList } from "../components/IssuesList";
import { CircleDot } from "lucide-react";

export function Issues() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initialSearch = searchParams.get("q") ?? "";
  const participantAgentId = searchParams.get("participantAgentId") ?? undefined;
  const handleSearchChange = useCallback((search: string) => {
    const trimmedSearch = search.trim();
    const currentSearch = new URLSearchParams(window.location.search).get("q") ?? "";
    if (currentSearch === trimmedSearch) return;

    const url = new URL(window.location.href);
    if (trimmedSearch) {
      url.searchParams.set("q", trimmedSearch);
    } else {
      url.searchParams.delete("q");
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    // WS invalidates this; 60s poll as fallback only
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  const issueLinkState = useMemo(
    () =>
      createIssueDetailLocationState(
        "Issues",
        `${location.pathname}${location.search}${location.hash}`,
        "issues",
      ),
    [location.pathname, location.search, location.hash],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Issues" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: [...queryKeys.issues.list(selectedCompanyId!), "participant-agent", participantAgentId ?? "__all__"],
    queryFn: () => issuesApi.list(selectedCompanyId!, { participantAgentId }),
    enabled: !!selectedCompanyId,
    staleTime: 120_000,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onMutate: async ({ id, data }) => {
      if (!selectedCompanyId) return {};
      // Cancel anything in flight that could overwrite our optimistic patch.
      await queryClient.cancelQueries({ queryKey: ["issues", selectedCompanyId] });
      await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(id) });

      // Snapshot every list cache that matches this company so we can roll back.
      const previousLists = queryClient.getQueriesData<Issue[]>({ queryKey: ["issues", selectedCompanyId] });
      const previousDetail = queryClient.getQueryData<Issue>(queryKeys.issues.detail(id));

      queryClient.setQueriesData<Issue[]>(
        { queryKey: ["issues", selectedCompanyId] },
        (old) => mergeIssueInList(old, id, data),
      );
      queryClient.setQueryData<Issue>(
        queryKeys.issues.detail(id),
        (old) => applyOptimisticIssuePatch(old, data),
      );

      return { previousLists, previousDetail };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.issues.detail(id), context.previousDetail);
      }
    },
    onSettled: (_data, _err, { id }) => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(id) });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={CircleDot} message="Select a company to view issues." />;
  }

  return (
    <IssuesList
      issues={issues ?? []}
      isLoading={isLoading}
      error={error as Error | null}
      agents={agents}
      projects={projects}
      liveIssueIds={liveIssueIds}
      viewStateKey="paperclip:issues-view"
      issueLinkState={issueLinkState}
      initialAssignees={searchParams.get("assignee") ? [searchParams.get("assignee")!] : undefined}
      initialSearch={initialSearch}
      onSearchChange={handleSearchChange}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
      searchFilters={participantAgentId ? { participantAgentId } : undefined}
    />
  );
}
