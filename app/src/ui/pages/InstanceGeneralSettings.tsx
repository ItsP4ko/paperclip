import { useEffect, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PatchInstanceGeneralSettings } from "@paperclipai/shared";
import { SlidersHorizontal, Terminal, Check, Copy, RefreshCw, KeyRound, CircleCheck, CircleX, CircleDashed, LogIn, Cpu } from "lucide-react";
import { instanceSettingsApi } from "@/ui/api/instanceSettings";
import { Button } from "@/ui/components/ui/button";
import { API_BASE, getBearerHeaders } from "@/ui/lib/api-base";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

type AdapterAuthStatus = {
  available: boolean;
  loggedIn: boolean;
  email?: string;
  method?: string;
  detail?: string;
};

type AdapterAuthInfo = {
  type: string;
  label: string;
  loginLabel: string;
};

const ADAPTER_AUTH_LIST: AdapterAuthInfo[] = [
  { type: "claude_local", label: "Claude Code", loginLabel: "claude auth login" },
  { type: "gemini_local", label: "Gemini CLI", loginLabel: "gemini auth login" },
  { type: "codex_local",  label: "Codex CLI",  loginLabel: "codex login" },
];

async function fetchAdapterAuthStatus(type: string): Promise<AdapterAuthStatus> {
  const res = await fetch(`${API_BASE}/instance/adapter-auth/${type}/status`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch auth status for ${type}`);
  return res.json() as Promise<AdapterAuthStatus>;
}

async function triggerAdapterLogin(type: string): Promise<{ authUrl?: string }> {
  const res = await fetch(`${API_BASE}/instance/adapter-auth/${type}/login`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to start login for ${type}`);
  return res.json() as Promise<{ authUrl?: string }>;
}

async function submitAdapterAuthCode(type: string, code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/instance/adapter-auth/${type}/login/code`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to submit code");
  }
}

const MAX_AUTH_POLLS = 40; // ~2 minutes

function AdapterAuthRow({ adapter }: { adapter: AdapterAuthInfo }) {
  const [loginStarted, setLoginStarted] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState("");
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSubmitted, setCodeSubmitted] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["adapter-auth-status", adapter.type, pollCount],
    queryFn: () => fetchAdapterAuthStatus(adapter.type),
    retry: false,
    staleTime: 0,
  });

  const refresh = useCallback(() => setPollCount((n) => n + 1), []);

  // Poll every 3s after login is triggered, stop after MAX_AUTH_POLLS
  useEffect(() => {
    if (!loginStarted || statusQuery.data?.loggedIn || pollCount >= MAX_AUTH_POLLS) return;
    const id = setTimeout(refresh, 3000);
    return () => clearTimeout(id);
  }, [loginStarted, statusQuery.data?.loggedIn, pollCount, refresh]);

  async function handleLogin() {
    setLoginError(null);
    setAuthUrl(null);
    setAuthCode("");
    setCodeError(null);
    setCodeSubmitted(false);
    try {
      const result = await triggerAdapterLogin(adapter.type);
      setLoginStarted(true);
      if (result.authUrl) setAuthUrl(result.authUrl);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Failed to start login");
    }
  }

  async function handleCodeSubmit() {
    if (!authCode.trim()) return;
    setCodeError(null);
    setCodeSubmitting(true);
    try {
      await submitAdapterAuthCode(adapter.type, authCode.trim());
      setCodeSubmitted(true);
      setAuthCode("");
      // Trigger an immediate status check
      refresh();
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Failed to submit code");
    } finally {
      setCodeSubmitting(false);
    }
  }

  const status = statusQuery.data;
  const isLoading = statusQuery.isLoading;

  function StatusBadge() {
    if (isLoading) {
      return <span className="text-xs text-muted-foreground">Checking...</span>;
    }
    if (!status?.available) {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CircleDashed className="h-3.5 w-3.5" />
          Not installed
        </span>
      );
    }
    if (status.loggedIn) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
          <CircleCheck className="h-3.5 w-3.5" />
          {status.email ? status.email : status.method === "api_key" ? "API key" : "Authenticated"}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <CircleX className="h-3.5 w-3.5" />
        Not logged in
      </span>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm font-medium">{adapter.label}</div>
        <StatusBadge />
        {loginStarted && !status?.loggedIn && (
          <div className="space-y-2 mt-1">
            {authUrl ? (
              <>
                <p className="text-xs text-muted-foreground">
                  1.{" "}
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Open this URL to authenticate
                  </a>
                </p>
                {!codeSubmitted ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      2. Copy the code shown on the Claude Platform page and paste it here:
                    </p>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={authCode}
                        onChange={(e) => setAuthCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleCodeSubmit(); }}
                        placeholder="Paste authentication code..."
                        className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => void handleCodeSubmit()}
                        disabled={codeSubmitting || !authCode.trim()}
                      >
                        {codeSubmitting ? "Submitting..." : "Submit"}
                      </Button>
                    </div>
                    {codeError && <p className="text-xs text-destructive">{codeError}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Code submitted. Checking status...</p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Starting login... Checking automatically.
              </p>
            )}
            {pollCount >= MAX_AUTH_POLLS && (
              <p className="text-xs text-destructive">
                Timed out. Click Login again to restart.
              </p>
            )}
          </div>
        )}
        {loginError && (
          <p className="text-xs text-destructive">{loginError}</p>
        )}
        {status?.detail && !status.loggedIn && (
          <p className="text-xs text-muted-foreground">{status.detail}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
        {status?.available && !status?.loggedIn && (
          <Button variant="outline" size="sm" onClick={handleLogin} disabled={loginStarted && !status?.loggedIn}>
            <LogIn className="h-3.5 w-3.5" />
            {loginStarted ? "Waiting..." : "Login"}
          </Button>
        )}
      </div>
    </div>
  );
}

const FEEDBACK_TERMS_URL = process.env.NEXT_PUBLIC_FEEDBACK_TERMS_URL?.trim() || "https://paperclip.ing/tos";

export function InstanceGeneralSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [cliLoading, setCliLoading] = useState(false);
  const [cliError, setCliError] = useState<string | null>(null);
  const [cliCommand, setCliCommand] = useState<string | null>(null);
  const [cliCopied, setCliCopied] = useState(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Instance Settings" },
      { label: "General" },
    ]);
  }, [setBreadcrumbs]);

  const generalQuery = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
  });

  const updateGeneralMutation = useMutation({
    mutationFn: instanceSettingsApi.updateGeneral,
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.generalSettings });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update general settings.");
    },
  });

  async function handleGenerateCliCommand() {
    setCliLoading(true);
    setCliError(null);
    setCliCommand(null);
    setCliCopied(false);
    try {
      const res = await fetch(`${API_BASE}/cli-setup/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getBearerHeaders() },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          (errBody as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
        );
      }
      const data = await res.json() as {
        token: string;
        serverUrl: string;
        expiresAt: string;
        userEmail: string;
      };
      setCliCommand(`npx relaycontrol@latest connect --server "${data.serverUrl}" --token "${data.token}"`);
    } catch (err) {
      setCliError(err instanceof Error ? err.message : "Failed to generate setup command.");
    } finally {
      setCliLoading(false);
    }
  }

  async function handleCopyCliCommand() {
    if (!cliCommand) return;
    await navigator.clipboard.writeText(cliCommand);
    setCliCopied(true);
    setTimeout(() => setCliCopied(false), 2000);
  }

  if (generalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading general settings...</div>;
  }

  if (generalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {generalQuery.error instanceof Error
          ? generalQuery.error.message
          : "Failed to load general settings."}
      </div>
    );
  }

  const censorUsernameInLogs = generalQuery.data?.censorUsernameInLogs === true;
  const keyboardShortcuts = generalQuery.data?.keyboardShortcuts === true;
  const feedbackDataSharingPreference = generalQuery.data?.feedbackDataSharingPreference ?? "prompt";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">General</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure instance-wide defaults that affect how operator-visible logs are displayed.
        </p>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">CLI Setup</h2>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Connect your machine to this Relay Control instance.
            </p>
          </div>

          {cliError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {cliError}
            </div>
          )}

          {!cliCommand ? (
            <Button
              variant="outline"
              size="sm"
              disabled={cliLoading}
              onClick={handleGenerateCliCommand}
            >
              <Terminal className="h-3.5 w-3.5" />
              {cliLoading ? "Generating..." : "Generate Setup Command"}
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground select-all overflow-x-auto whitespace-nowrap">
                  {cliCommand}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopyCliCommand}>
                  {cliCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {cliCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={handleGenerateCliCommand}
                >
                  <RefreshCw className="inline h-3 w-3 mr-1" />
                  Regenerate
                </button>
                <span className="text-xs text-muted-foreground">Expires in 30 days</span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Paste this command in the terminal of the machine you want to connect. Requires Node.js 20+.
          </p>

          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
              Teammate doesn't have Node.js?
            </summary>
            <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Tell them to install Node.js first:</p>
              <div className="space-y-1.5">
                <div>
                  <span className="text-xs font-medium text-foreground">macOS</span>
                  <code className="block rounded border border-border bg-muted/40 px-2 py-1 mt-0.5 text-xs font-mono text-foreground select-all">
                    brew install node
                  </code>
                </div>
                <div>
                  <span className="text-xs font-medium text-foreground">Linux (Ubuntu/Debian)</span>
                  <code className="block rounded border border-border bg-muted/40 px-2 py-1 mt-0.5 text-xs font-mono text-foreground select-all">
                    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - &amp;&amp; sudo apt install -y nodejs
                  </code>
                </div>
                <div>
                  <span className="text-xs font-medium text-foreground">Windows</span>
                  <code className="block rounded border border-border bg-muted/40 px-2 py-1 mt-0.5 text-xs font-mono text-foreground select-all">
                    winget install OpenJS.NodeJS.LTS
                  </code>
                </div>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Censor username in logs</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Hide the username segment in home-directory paths and similar operator-visible log output. Standalone
              username mentions outside of paths are not yet masked in the live transcript view. This is off by
              default.
            </p>
          </div>
          <button
            type="button"
            data-slot="toggle"
            aria-label="Toggle username log censoring"
            disabled={updateGeneralMutation.isPending}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              censorUsernameInLogs ? "bg-green-600" : "bg-muted",
            )}
            onClick={() =>
              updateGeneralMutation.mutate({
                censorUsernameInLogs: !censorUsernameInLogs,
              })
            }
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                censorUsernameInLogs ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Enable app keyboard shortcuts, including inbox navigation and global shortcuts like creating issues or
              toggling panels. This is off by default.
            </p>
          </div>
          <button
            type="button"
            data-slot="toggle"
            aria-label="Toggle keyboard shortcuts"
            disabled={updateGeneralMutation.isPending}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              keyboardShortcuts ? "bg-green-600" : "bg-muted",
            )}
            onClick={() => updateGeneralMutation.mutate({ keyboardShortcuts: !keyboardShortcuts })}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                keyboardShortcuts ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </section>

      {/* AI feedback sharing — hidden until we decide whether to implement it.
          Backend logic exists in feedback-share-client.ts (FEEDBACK_EXPORT_BACKEND_URL env var).
          Re-enable by restoring this section and the feedbackDataSharingPreference query/mutation. */}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Adapter Authentication</h2>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Login to the AI adapters used to run agents on this machine. Clicking Login opens your browser to complete authentication.
            </p>
          </div>
          <div className="divide-y divide-border">
            {ADAPTER_AUTH_LIST.map((adapter) => (
              <AdapterAuthRow key={adapter.type} adapter={adapter} />
            ))}
          </div>
        </div>
      </section>

      <LocalRunnerSetupSection />
    </div>
  );
}

function LocalRunnerSetupSection() {
  const [copied, setCopied] = useState(false);
  const instanceUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") || window.location.origin;
  const command = `npx relaycontrol@latest runner start --api-base ${instanceUrl}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(command).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Local Runner Setup</h2>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Run agents on your own machine instead of on this server. Enable{" "}
            <span className="font-medium text-foreground">Run locally</span> in an agent's Run Policy, then start the runner below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground select-all overflow-x-auto whitespace-nowrap">
            {command}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Requires Node.js 20+. No installation needed — <code className="font-mono">npx</code> downloads it automatically.
        </p>
      </div>
    </section>
  );
}
