import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Layout } from "./components/Layout";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PageSkeleton } from "./components/PageSkeleton";
import { authApi } from "./api/auth";
import { healthApi } from "./api/health";
import { queryKeys } from "./lib/queryKeys";
import { useCompany } from "./context/CompanyContext";
import { useDialog } from "./context/DialogContext";
import { loadLastInboxTab } from "./lib/inbox";
import { shouldRedirectCompanylessRouteToOnboarding } from "./lib/onboarding-route";
import { isTauriEnv } from "./lib/platform";

const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Companies = lazy(() => import("./pages/Companies").then((m) => ({ default: m.Companies })));
const Agents = lazy(() => import("./pages/Agents").then((m) => ({ default: m.Agents })));
const AgentDetail = lazy(() => import("./pages/AgentDetail").then((m) => ({ default: m.AgentDetail })));
const Projects = lazy(() => import("./pages/Projects").then((m) => ({ default: m.Projects })));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail").then((m) => ({ default: m.ProjectDetail })));
const ProjectWorkspaceDetail = lazy(() => import("./pages/ProjectWorkspaceDetail").then((m) => ({ default: m.ProjectWorkspaceDetail })));
const Issues = lazy(() => import("./pages/Issues").then((m) => ({ default: m.Issues })));
const IssueDetail = lazy(() => import("./pages/IssueDetail").then((m) => ({ default: m.IssueDetail })));
const Routines = lazy(() => import("./pages/Routines").then((m) => ({ default: m.Routines })));
const RoutineDetail = lazy(() => import("./pages/RoutineDetail").then((m) => ({ default: m.RoutineDetail })));
const ExecutionWorkspaceDetail = lazy(() => import("./pages/ExecutionWorkspaceDetail").then((m) => ({ default: m.ExecutionWorkspaceDetail })));
const Goals = lazy(() => import("./pages/Goals").then((m) => ({ default: m.Goals })));
const GoalDetail = lazy(() => import("./pages/GoalDetail").then((m) => ({ default: m.GoalDetail })));
const Approvals = lazy(() => import("./pages/Approvals").then((m) => ({ default: m.Approvals })));
const ApprovalDetail = lazy(() => import("./pages/ApprovalDetail").then((m) => ({ default: m.ApprovalDetail })));
const Costs = lazy(() => import("./pages/Costs").then((m) => ({ default: m.Costs })));
const Activity = lazy(() => import("./pages/Activity").then((m) => ({ default: m.Activity })));
const Analytics = lazy(() => import("./pages/Analytics").then((m) => ({ default: m.Analytics })));
const AuditLog = lazy(() => import("./pages/AuditLog").then((m) => ({ default: m.AuditLog })));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase").then((m) => ({ default: m.KnowledgeBase })));
const CostRecommendations = lazy(() => import("./pages/CostRecommendations").then((m) => ({ default: m.CostRecommendations })));
const Pipelines = lazy(() => import("./pages/Pipelines").then((m) => ({ default: m.Pipelines })));
const PipelineDetail = lazy(() => import("./pages/PipelineDetail").then((m) => ({ default: m.PipelineDetail })));
const PipelineRunDetail = lazy(() => import("./pages/PipelineRunDetail").then((m) => ({ default: m.PipelineRunDetail })));
const Inbox = lazy(() => import("./pages/Inbox").then((m) => ({ default: m.Inbox })));
const CompanySettings = lazy(() => import("./pages/CompanySettings").then((m) => ({ default: m.CompanySettings })));
const RemoteControl = lazy(() => import("./pages/RemoteControl").then((m) => ({ default: m.RemoteControl })));
const MyIssues = lazy(() => import("./pages/MyIssues").then((m) => ({ default: m.MyIssues })));
const CompanySkills = lazy(() => import("./pages/CompanySkills").then((m) => ({ default: m.CompanySkills })));
const CompanyExport = lazy(() => import("./pages/CompanyExport").then((m) => ({ default: m.CompanyExport })));
const CompanyImport = lazy(() => import("./pages/CompanyImport").then((m) => ({ default: m.CompanyImport })));
const AccountSettings = lazy(() => import("./pages/AccountSettings").then((m) => ({ default: m.AccountSettings })));
const DesignGuide = lazy(() => import("./pages/DesignGuide").then((m) => ({ default: m.DesignGuide })));
const InstanceGeneralSettings = lazy(() => import("./pages/InstanceGeneralSettings").then((m) => ({ default: m.InstanceGeneralSettings })));
const InstanceSettings = lazy(() => import("./pages/InstanceSettings").then((m) => ({ default: m.InstanceSettings })));
const InstanceExperimentalSettings = lazy(() => import("./pages/InstanceExperimentalSettings").then((m) => ({ default: m.InstanceExperimentalSettings })));
const PluginManager = lazy(() => import("./pages/PluginManager").then((m) => ({ default: m.PluginManager })));
const PluginSettings = lazy(() => import("./pages/PluginSettings").then((m) => ({ default: m.PluginSettings })));
const PluginPage = lazy(() => import("./pages/PluginPage").then((m) => ({ default: m.PluginPage })));
const RunTranscriptUxLab = lazy(() => import("./pages/RunTranscriptUxLab").then((m) => ({ default: m.RunTranscriptUxLab })));
const Org = lazy(() => import("./pages/Org").then((m) => ({ default: m.Org })));
const Members = lazy(() => import("./pages/Members").then((m) => ({ default: m.Members })));
const NewAgent = lazy(() => import("./pages/NewAgent").then((m) => ({ default: m.NewAgent })));
const AuthPage = lazy(() => import("./pages/Auth").then((m) => ({ default: m.AuthPage })));
const BoardClaimPage = lazy(() => import("./pages/BoardClaim").then((m) => ({ default: m.BoardClaimPage })));
const CliAuthPage = lazy(() => import("./pages/CliAuth").then((m) => ({ default: m.CliAuthPage })));
const InviteLandingPage = lazy(() => import("./pages/InviteLanding").then((m) => ({ default: m.InviteLandingPage })));
const NotFoundPage = lazy(() => import("./pages/NotFound").then((m) => ({ default: m.NotFoundPage })));
const DownloadPage = lazy(() => import("./pages/Download").then((m) => ({ default: m.DownloadPage })));
const Sprints = lazy(() => import("./pages/Sprints").then((m) => ({ default: m.Sprints })));
const SprintPlanning = lazy(() => import("./pages/SprintPlanning").then((m) => ({ default: m.SprintPlanning })));
const SprintMetrics = lazy(() => import("./pages/SprintMetrics").then((m) => ({ default: m.SprintMetrics })));


function TauriGuard() {
  if (!isTauriEnv()) return <Navigate to="/" replace />;
  return <Outlet />;
}

function BootstrapPendingPage({ hasActiveInvite = false }: { hasActiveInvite?: boolean }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Instance setup required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasActiveInvite
            ? "No instance admin exists yet. A bootstrap invite is already active. Check your Relay Control startup logs for the first admin invite URL, or run this command to rotate it:"
            : "No instance admin exists yet. Run this command in your Relay Control environment to generate the first admin invite URL:"}
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
{`pnpm relaycontrol auth bootstrap-ceo`}
        </pre>
      </div>
    </div>
  );
}

function CloudAccessGate() {
  const location = useLocation();
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as
        | { deploymentMode?: "local_trusted" | "authenticated"; bootstrapStatus?: "ready" | "bootstrap_pending" }
        | undefined;
      return data?.deploymentMode === "authenticated" && data.bootstrapStatus === "bootstrap_pending"
        ? 2000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: isAuthenticatedMode,
    retry: false,
  });

  if (healthQuery.isLoading || (isAuthenticatedMode && sessionQuery.isLoading)) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  if (healthQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10 text-sm text-destructive">
        {healthQuery.error instanceof Error ? healthQuery.error.message : "Failed to load app state"}
      </div>
    );
  }

  if (isAuthenticatedMode && healthQuery.data?.bootstrapStatus === "bootstrap_pending") {
    return <BootstrapPendingPage hasActiveInvite={healthQuery.data.bootstrapInviteActive} />;
  }

  if (isAuthenticatedMode && !sessionQuery.data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  return <Outlet />;
}

const S = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>{children}</Suspense>
);

function boardRoutes() {
  return (
    <>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<S><Dashboard /></S>} />
      <Route path="onboarding" element={<OnboardingRoutePage />} />
      <Route path="companies" element={<S><Companies /></S>} />
      <Route path="company/settings" element={<S><CompanySettings /></S>} />
      <Route path="remote-control" element={<S><RemoteControl /></S>} />
      <Route path="company/export/*" element={<S><CompanyExport /></S>} />
      <Route path="company/import" element={<S><CompanyImport /></S>} />
      <Route path="skills/*" element={<S><CompanySkills /></S>} />
      <Route path="settings" element={<LegacySettingsRedirect />} />
      <Route path="settings/*" element={<LegacySettingsRedirect />} />
      <Route path="plugins/:pluginId" element={<S><PluginPage /></S>} />
      <Route path="org" element={<S><Org /></S>} />
      <Route path="members" element={<S><Members /></S>} />
      <Route element={<TauriGuard />}>
        <Route path="agents" element={<Navigate to="/agents/all" replace />} />
        <Route path="agents/all" element={<S><Agents /></S>} />
        <Route path="agents/active" element={<S><Agents /></S>} />
        <Route path="agents/paused" element={<S><Agents /></S>} />
        <Route path="agents/error" element={<S><Agents /></S>} />
        <Route path="agents/new" element={<S><NewAgent /></S>} />
        <Route path="agents/:agentId" element={<S><AgentDetail /></S>} />
        <Route path="agents/:agentId/:tab" element={<S><AgentDetail /></S>} />
        <Route path="agents/:agentId/runs/:runId" element={<S><AgentDetail /></S>} />
      </Route>
      <Route path="projects" element={<S><Projects /></S>} />
      <Route path="projects/:projectId" element={<S><ProjectDetail /></S>} />
      <Route path="projects/:projectId/overview" element={<S><ProjectDetail /></S>} />
      <Route path="projects/:projectId/issues" element={<S><ProjectDetail /></S>} />
      <Route path="projects/:projectId/issues/:filter" element={<S><ProjectDetail /></S>} />
      <Route path="projects/:projectId/workspaces/:workspaceId" element={<S><ProjectWorkspaceDetail /></S>} />
      <Route path="projects/:projectId/workspaces" element={<S><ProjectDetail /></S>} />
      <Route path="projects/:projectId/library" element={<S><ProjectDetail /></S>} />
      <Route path="projects/:projectId/configuration" element={<S><ProjectDetail /></S>} />
      <Route path="projects/:projectId/budget" element={<S><ProjectDetail /></S>} />
      <Route path="my-tasks" element={<S><MyIssues /></S>} />
      <Route path="issues" element={<S><Issues /></S>} />
      <Route path="issues/all" element={<Navigate to="/issues" replace />} />
      <Route path="issues/active" element={<Navigate to="/issues" replace />} />
      <Route path="issues/backlog" element={<Navigate to="/issues" replace />} />
      <Route path="issues/done" element={<Navigate to="/issues" replace />} />
      <Route path="issues/recent" element={<Navigate to="/issues" replace />} />
      <Route path="issues/:issueId" element={<S><IssueDetail /></S>} />
      <Route path="routines" element={<S><Routines /></S>} />
      <Route path="routines/:routineId" element={<S><RoutineDetail /></S>} />
      <Route path="execution-workspaces/:workspaceId" element={<S><ExecutionWorkspaceDetail /></S>} />
      <Route path="goals" element={<S><Goals /></S>} />
      <Route path="goals/:goalId" element={<S><GoalDetail /></S>} />
      <Route path="approvals" element={<Navigate to="/approvals/pending" replace />} />
      <Route path="approvals/pending" element={<S><Approvals /></S>} />
      <Route path="approvals/all" element={<S><Approvals /></S>} />
      <Route path="approvals/:approvalId" element={<S><ApprovalDetail /></S>} />
      <Route path="costs" element={<S><Costs /></S>} />
      <Route path="activity" element={<S><Activity /></S>} />
      <Route path="analytics" element={<S><Analytics /></S>} />
      <Route path="audit" element={<S><AuditLog /></S>} />
      <Route path="knowledge" element={<S><KnowledgeBase /></S>} />
      <Route path="cost-recommendations" element={<S><CostRecommendations /></S>} />
      <Route path="sprints" element={<S><Sprints /></S>} />
      <Route path="sprints/:sprintId/plan" element={<S><SprintPlanning /></S>} />
      <Route path="sprints/:sprintId/metrics" element={<S><SprintMetrics /></S>} />
      <Route path="pipelines" element={<S><Pipelines /></S>} />
      <Route path="pipelines/:pipelineId" element={<S><PipelineDetail /></S>} />
      <Route path="pipelines/:pipelineId/runs/:runId" element={<S><PipelineRunDetail /></S>} />
      <Route path="inbox" element={<InboxRootRedirect />} />
      <Route path="inbox/mine" element={<S><Inbox /></S>} />
      <Route path="inbox/recent" element={<S><Inbox /></S>} />
      <Route path="inbox/unread" element={<S><Inbox /></S>} />
      <Route path="inbox/all" element={<S><Inbox /></S>} />
      <Route path="inbox/new" element={<Navigate to="/inbox/mine" replace />} />
      <Route path="design-guide" element={<S><DesignGuide /></S>} />
      <Route path="tests/ux/runs" element={<S><RunTranscriptUxLab /></S>} />
      <Route path=":pluginRoutePath" element={<S><PluginPage /></S>} />
      <Route path="*" element={<S><NotFoundPage scope="board" /></S>} />
    </>
  );
}

function InboxRootRedirect() {
  return <Navigate to={`/inbox/${loadLastInboxTab()}`} replace />;
}

function LegacySettingsRedirect() {
  const location = useLocation();
  return <Navigate to={`/instance/settings/general${location.search}${location.hash}`} replace />;
}

function OnboardingRoutePage() {
  const { companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const matchedCompany = companyPrefix
    ? companies.find((company) => company.issuePrefix.toUpperCase() === companyPrefix.toUpperCase()) ?? null
    : null;

  const title = matchedCompany
    ? `Add another agent to ${matchedCompany.name}`
    : companies.length > 0
      ? "Create another company"
      : "Create your first company";
  const description = matchedCompany
    ? "Run onboarding again to add an agent and a starter task for this company."
    : companies.length > 0
      ? "Run onboarding again to create another company and seed its first agent."
      : "Get started by creating a company and your first agent.";

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4">
          <Button
            onClick={() =>
              matchedCompany
                ? openOnboarding({ initialStep: 2, companyId: matchedCompany.id })
                : openOnboarding()
            }
          >
            {matchedCompany ? "Add Agent" : "Start Onboarding"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompanyRootRedirect() {
  const { companies, selectedCompany, loading } = useCompany();
  const location = useLocation();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to="/onboarding" replace />;
    }
    return <NoCompaniesStartPage />;
  }

  return <Navigate to={`/${targetCompany.issuePrefix}/dashboard`} replace />;
}

function UnprefixedBoardRedirect() {
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to="/onboarding" replace />;
    }
    return <NoCompaniesStartPage />;
  }

  return (
    <Navigate
      to={`/${targetCompany.issuePrefix}${location.pathname}${location.search}${location.hash}`}
      replace
    />
  );
}

function NoCompaniesStartPage() {
  const { openOnboarding } = useDialog();

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Create your first company</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Get started by creating a company.
        </p>
        <div className="mt-4">
          <Button onClick={() => openOnboarding()}>New Company</Button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="auth" element={<S><AuthPage /></S>} />
        <Route path="download" element={<S><DownloadPage /></S>} />
        <Route path="board-claim/:token" element={<S><BoardClaimPage /></S>} />
        <Route path="cli-auth/:id" element={<S><CliAuthPage /></S>} />
        <Route path="invite/:token" element={<S><InviteLandingPage /></S>} />

        <Route element={<CloudAccessGate />}>
          <Route index element={<CompanyRootRedirect />} />
          <Route path="onboarding" element={<OnboardingRoutePage />} />
          <Route path="instance" element={<Navigate to="/instance/settings/general" replace />} />
          <Route path="instance/settings" element={<Layout />}>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<S><InstanceGeneralSettings /></S>} />
            <Route path="heartbeats" element={<S><InstanceSettings /></S>} />
            <Route path="experimental" element={<S><InstanceExperimentalSettings /></S>} />
            <Route path="plugins" element={<S><PluginManager /></S>} />
            <Route path="plugins/:pluginId" element={<S><PluginSettings /></S>} />
          </Route>
          <Route path="companies" element={<UnprefixedBoardRedirect />} />
          <Route path="issues" element={<UnprefixedBoardRedirect />} />
          <Route path="issues/:issueId" element={<UnprefixedBoardRedirect />} />
          <Route path="routines" element={<UnprefixedBoardRedirect />} />
          <Route path="routines/:routineId" element={<UnprefixedBoardRedirect />} />
          <Route path="skills/*" element={<UnprefixedBoardRedirect />} />
          <Route path="settings" element={<LegacySettingsRedirect />} />
          <Route path="settings/*" element={<LegacySettingsRedirect />} />
          <Route path="agents" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/new" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId/:tab" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId/runs/:runId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/overview" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/issues" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/issues/:filter" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/workspaces" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/workspaces/:workspaceId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/configuration" element={<UnprefixedBoardRedirect />} />
          <Route path="my-tasks" element={<UnprefixedBoardRedirect />} />
          <Route path="execution-workspaces/:workspaceId" element={<UnprefixedBoardRedirect />} />
          <Route path="knowledge" element={<UnprefixedBoardRedirect />} />
          <Route path="remote-control" element={<UnprefixedBoardRedirect />} />
          <Route path="cost-recommendations" element={<UnprefixedBoardRedirect />} />
          <Route path="pipelines" element={<UnprefixedBoardRedirect />} />
          <Route path="pipelines/:pipelineId" element={<UnprefixedBoardRedirect />} />
          <Route path="pipelines/:pipelineId/runs/:runId" element={<UnprefixedBoardRedirect />} />
          <Route path="tests/ux/runs" element={<UnprefixedBoardRedirect />} />
          <Route path="analytics" element={<UnprefixedBoardRedirect />} />
          <Route path="audit" element={<UnprefixedBoardRedirect />} />
          <Route path="activity" element={<UnprefixedBoardRedirect />} />
          <Route path="costs" element={<UnprefixedBoardRedirect />} />
          <Route path="goals" element={<UnprefixedBoardRedirect />} />
          <Route path="goals/:goalId" element={<UnprefixedBoardRedirect />} />
          <Route path="approvals" element={<UnprefixedBoardRedirect />} />
          <Route path="approvals/pending" element={<UnprefixedBoardRedirect />} />
          <Route path="approvals/all" element={<UnprefixedBoardRedirect />} />
          <Route path="approvals/:approvalId" element={<UnprefixedBoardRedirect />} />
          <Route path="inbox" element={<UnprefixedBoardRedirect />} />
          <Route path="inbox/mine" element={<UnprefixedBoardRedirect />} />
          <Route path="inbox/recent" element={<UnprefixedBoardRedirect />} />
          <Route path="inbox/unread" element={<UnprefixedBoardRedirect />} />
          <Route path="inbox/all" element={<UnprefixedBoardRedirect />} />
          <Route path="org" element={<UnprefixedBoardRedirect />} />
          <Route path="dashboard" element={<UnprefixedBoardRedirect />} />
          <Route path="account" element={<Layout />}>
            <Route index element={<S><AccountSettings /></S>} />
          </Route>
          <Route path=":companyPrefix" element={<Layout />}>
            {boardRoutes()}
          </Route>
          <Route path="*" element={<S><NotFoundPage scope="global" /></S>} />
        </Route>
      </Routes>
      <OnboardingWizard />
    </>
  );
}
