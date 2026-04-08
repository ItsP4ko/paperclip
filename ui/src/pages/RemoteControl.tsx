import { useEffect, useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { ToggleField } from "../components/agent-config-primitives";
import {
  Wifi,
  WifiOff,
  Monitor,
  Smartphone,
  Power,
  PowerOff,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

// --- Tauri interop types ---

type TailscaleStatus = {
  installed: boolean;
  running: boolean;
  ip: string | null;
  hostname: string | null;
  dns_name: string | null;
};

type RemoteControlInfo = {
  active: boolean;
  url: string | null;
  pin: string | null;
  tailscale: TailscaleStatus;
  server_port: number;
};

function isTauriEnv(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI__" in window || "__TAURI_INTERNALS__" in window)
  );
}

// --- QR Code component (simple SVG-based) ---

function QRCodePlaceholder({ value }: { value: string }) {
  // Simple visual placeholder showing the URL prominently.
  // A real QR library (e.g. qrcode.react) can replace this.
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/20 p-6">
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className={`h-3 w-3 rounded-sm ${
              // Pseudo-random pattern based on URL hash for visual effect
              (i * 7 + value.length) % 3 === 0
                ? "bg-foreground"
                : (i * 13 + value.length) % 5 === 0
                ? "bg-foreground"
                : "bg-muted-foreground/20"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-center max-w-[200px] break-all font-mono">
        {value}
      </p>
    </div>
  );
}

// --- Main component ---

export function RemoteControl() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [tailscale, setTailscale] = useState<TailscaleStatus | null>(null);
  const [rcInfo, setRcInfo] = useState<RemoteControlInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [copied, setCopied] = useState(false);
  const inTauri = isTauriEnv();

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Remote Control" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const refresh = useCallback(async () => {
    if (!inTauri) {
      setLoading(false);
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const info = await invoke<RemoteControlInfo>("get_remote_control_status");
      setRcInfo(info);
      setTailscale(info.tailscale);
    } catch {
      setTailscale(null);
      setRcInfo(null);
    } finally {
      setLoading(false);
    }
  }, [inTauri]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      companiesApi.update(selectedCompanyId!, { remoteControlEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
    onError: (err) => {
      pushToast({
        title: "Failed to update Remote Control policy",
        body: err instanceof Error ? err.message : "Unexpected error",
        tone: "error",
      });
    },
  });

  async function handleActivate() {
    if (!inTauri) return;
    setActivating(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const info = await invoke<RemoteControlInfo>("activate_remote_control");
      setRcInfo(info);
      setTailscale(info.tailscale);
      pushToast({ title: "Remote Control activated", tone: "success" });
    } catch (err) {
      pushToast({
        title: "Failed to activate Remote Control",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setActivating(false);
    }
  }

  async function handleDeactivate() {
    if (!inTauri) return;
    setDeactivating(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("deactivate_remote_control");
      await refresh();
      pushToast({ title: "Remote Control deactivated", tone: "success" });
    } catch (err) {
      pushToast({
        title: "Failed to deactivate",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setDeactivating(false);
    }
  }

  async function handleCopyUrl() {
    if (!rcInfo?.url) return;
    try {
      await navigator.clipboard.writeText(rcInfo.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may not be available */
    }
  }

  if (!selectedCompanyId || !selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected.
      </div>
    );
  }

  // Non-Tauri environment: show explanation
  if (!inTauri) {
    return (
      <div className="max-w-2xl space-y-6">
        <Header />
        <div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center space-y-3">
          <Monitor className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Remote Control is only available from the Relay Control desktop app.
          </p>
          <p className="text-xs text-muted-foreground">
            Download the desktop app to control your local agents remotely from
            your phone or another device.
          </p>
        </div>

        {/* Company-level toggle still available from web */}
        <CompanyToggle
          enabled={selectedCompany.remoteControlEnabled}
          onToggle={(v) => toggleMutation.mutate(v)}
          pending={toggleMutation.isPending}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6">
        <Header />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Detecting Tailscale...
        </div>
      </div>
    );
  }

  const isActive = rcInfo?.active ?? false;
  const tsInstalled = tailscale?.installed ?? false;
  const tsRunning = tailscale?.running ?? false;

  return (
    <div className="max-w-2xl space-y-6">
      <Header />

      {/* Company permission toggle */}
      <CompanyToggle
        enabled={selectedCompany.remoteControlEnabled}
        onToggle={(v) => toggleMutation.mutate(v)}
        pending={toggleMutation.isPending}
      />

      {/* Tailscale status */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Tailscale Status
        </div>
        <div className="rounded-md border border-border px-4 py-4 space-y-3">
          <div className="flex items-center gap-3">
            {tsRunning ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">
                {!tsInstalled
                  ? "Tailscale not installed"
                  : !tsRunning
                  ? "Tailscale not running"
                  : "Tailscale connected"}
              </p>
              {tsRunning && tailscale?.dns_name && (
                <p className="text-xs text-muted-foreground font-mono">
                  {tailscale.dns_name}
                </p>
              )}
              {tsRunning && tailscale?.ip && (
                <p className="text-xs text-muted-foreground font-mono">
                  IP: {tailscale.ip}
                </p>
              )}
            </div>
          </div>

          {!tsInstalled && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-500/25 dark:bg-amber-950/60">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-xs text-amber-900 dark:text-amber-100">
                <p className="font-medium">Tailscale is required for Remote Control.</p>
                <p className="mt-1">
                  Install Tailscale on this computer and on the device you want
                  to use as a remote. Both devices must be on the same Tailnet.
                </p>
              </div>
            </div>
          )}

          {tsInstalled && !tsRunning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-500/25 dark:bg-amber-950/60">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-amber-900 dark:text-amber-100">
                Tailscale is installed but not connected. Run{" "}
                <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 rounded">
                  tailscale up
                </code>{" "}
                to connect.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Remote Control activation */}
      {tsRunning && selectedCompany.remoteControlEnabled && (
        <div className="space-y-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Remote Control
          </div>

          {!isActive ? (
            <div className="rounded-md border border-border px-4 py-6 text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full border-2 border-dashed border-muted-foreground/30 p-4">
                  <Smartphone className="h-8 w-8 text-muted-foreground" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Ready to activate</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This will start a local server accessible via your Tailscale
                  network. You can then open the link on your phone to control
                  agents running on this machine.
                </p>
              </div>
              <Button
                onClick={handleActivate}
                disabled={activating}
                className="gap-2"
              >
                <Power className="h-4 w-4" />
                {activating ? "Starting server..." : "Activate Remote Control"}
              </Button>
            </div>
          ) : (
            <div className="rounded-md border border-green-500/30 bg-green-50/50 dark:bg-green-950/20 px-4 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    Remote Control Active
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDeactivate}
                  disabled={deactivating}
                  className="gap-1.5 text-xs"
                >
                  <PowerOff className="h-3 w-3" />
                  {deactivating ? "Stopping..." : "Deactivate"}
                </Button>
              </div>

              {/* PIN display */}
              {rcInfo?.pin && (
                <div className="rounded-md border border-border bg-background/50 px-4 py-3 space-y-1 text-center">
                  <p className="text-xs text-muted-foreground">
                    Enter this PIN on your phone when prompted:
                  </p>
                  <p className="text-3xl font-mono font-bold tracking-[0.25em] text-foreground">
                    {rcInfo.pin}
                  </p>
                </div>
              )}

              {rcInfo?.url && (
                <>
                  {/* URL display */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Open this URL on your phone (must be on the same Tailscale network):
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono break-all">
                        {rcInfo.url}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCopyUrl}
                        className="shrink-0"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* QR Code */}
                  <QRCodePlaceholder value={rcInfo.url} />

                  {/* Connection info */}
                  <div className="rounded-md border border-border bg-background/50 px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Monitor className="h-3 w-3" />
                      Host: {tailscale?.hostname ?? "unknown"}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ExternalLink className="h-3 w-3" />
                      Port: {rcInfo.server_port}
                    </div>
                    {tailscale?.dns_name && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Wifi className="h-3 w-3" />
                        DNS: {tailscale.dns_name}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Show hint if Tailscale is fine but company toggle is off */}
      {tsRunning && !selectedCompany.remoteControlEnabled && (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Enable "Allow Remote Control" above to activate remote access for
            this company.
          </p>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Smartphone className="h-5 w-5 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Remote Control</h1>
    </div>
  );
}

function CompanyToggle({
  enabled,
  onToggle,
  pending,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Company Policy
      </div>
      <div className="rounded-md border border-border px-4 py-3">
        <ToggleField
          label="Allow Remote Control for this company"
          hint="When disabled, developers in this company cannot use Remote Control even if Tailscale is configured."
          checked={enabled}
          onChange={onToggle}
          disabled={pending}
        />
      </div>
    </div>
  );
}
