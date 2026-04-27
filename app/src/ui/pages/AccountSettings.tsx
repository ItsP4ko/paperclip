import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, type SessionEntry } from "../api/auth";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { Button } from "@/ui/components/ui/button";
import { Badge } from "@/ui/components/ui/badge";
import { Monitor, Smartphone } from "lucide-react";

/** Parse a minimal device/browser label from a User-Agent string */
function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";

  // Detect OS
  let os = "Unknown OS";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/iphone/i.test(ua)) os = "iPhone";
  else if (/ipad/i.test(ua)) os = "iPad";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";

  // Detect browser
  let browser = "Unknown browser";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua)) browser = "Safari";

  return `${browser} on ${os}`;
}

/** Is this an obviously mobile device? */
function isMobileUA(ua: string | null): boolean {
  if (!ua) return false;
  return /iphone|ipad|android/i.test(ua);
}

function SessionCard({
  session,
  isCurrent,
  onRevoke,
  isRevoking,
}: {
  session: SessionEntry;
  isCurrent: boolean;
  onRevoke: (token: string) => void;
  isRevoking: boolean;
}) {
  const deviceLabel = parseUserAgent(session.userAgent);
  const mobile = isMobileUA(session.userAgent);
  const ip = session.ipAddress ?? "Unknown";
  const createdAt = new Date(session.createdAt).toLocaleString();

  function handleRevoke() {
    if (!window.confirm(`Revoke session from "${deviceLabel}"? This cannot be undone.`)) return;
    onRevoke(session.token);
  }

  return (
    <div className="rounded-lg border border-border p-4 flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground shrink-0">
        {mobile ? <Smartphone className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{deviceLabel}</span>
          {isCurrent && (
            <Badge
              variant="default"
              className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20"
            >
              Current session
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          IP: {ip} &middot; Started {createdAt}
        </p>
      </div>
      {!isCurrent && (
        <Button
          variant="destructive"
          size="sm"
          onClick={handleRevoke}
          disabled={isRevoking}
          className="shrink-0"
        >
          Revoke
        </Button>
      )}
    </div>
  );
}

export function AccountSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Account Settings" }]);
  }, [setBreadcrumbs]);

  const currentToken = authApi.getCurrentSessionToken();

  const sessionsQuery = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: () => authApi.listSessions(),
    retry: false,
  });

  const revokeMutation = useMutation({
    mutationFn: (token: string) => authApi.revokeSession(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
      pushToast({ title: "Session revoked.", tone: "success" });
    },
    onError: (err: unknown) => {
      const title = err instanceof Error ? err.message : "Failed to revoke session";
      pushToast({ title, tone: "error" });
    },
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => authApi.revokeOtherSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
      pushToast({ title: "All other sessions revoked.", tone: "success" });
    },
    onError: (err: unknown) => {
      const title = err instanceof Error ? err.message : "Failed to revoke other sessions";
      pushToast({ title, tone: "error" });
    },
  });

  function handleRevokeOthers() {
    if (!window.confirm("Revoke all other sessions? Only your current session will remain.")) return;
    revokeOthersMutation.mutate();
  }

  const sessions = sessionsQuery.data ?? [];
  const hasOtherSessions = sessions.some((s) => s.token !== currentToken);

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Account Settings</h1>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Active Sessions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Devices and browsers currently signed in to your account. Revoke any sessions you don&apos;t
            recognize.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            disabled={!hasOtherSessions || revokeOthersMutation.isPending}
            onClick={handleRevokeOthers}
          >
            Revoke all other sessions
          </Button>
        </div>

        {sessionsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading sessions...</p>
        )}

        {sessionsQuery.isError && (
          <p className="text-sm text-destructive">
            Failed to load sessions.{" "}
            {sessionsQuery.error instanceof Error ? sessionsQuery.error.message : ""}
          </p>
        )}

        {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 && (
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        )}

        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isCurrent={session.token === currentToken}
              onRevoke={(token) => revokeMutation.mutate(token)}
              isRevoking={revokeMutation.isPending}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
