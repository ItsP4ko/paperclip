import { Download, Monitor, Apple } from "lucide-react";
import { Button } from "@/components/ui/button";

const REPO = "ItsP4ko/paperclip";
const RELEASES_BASE = `https://github.com/${REPO}/releases/latest/download`;

const ASSETS = {
  mac_arm: `${RELEASES_BASE}/Relay.Control_aarch64.dmg`,
  mac_intel: `${RELEASES_BASE}/Relay.Control_x64.dmg`,
  windows: `${RELEASES_BASE}/Relay.Control_x64-setup.exe`,
};

function detectPlatform(): "mac_arm" | "mac_intel" | "windows" | "other" {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent;
  const isWindows = /Win/i.test(ua);
  const isMac = /Mac/i.test(ua);
  const isArm = /arm64|aarch64/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform ?? ""
  );
  if (isWindows) return "windows";
  if (isMac && isArm) return "mac_arm";
  if (isMac) return "mac_intel";
  return "other";
}

export function DownloadPage() {
  const platform = detectPlatform();

  const primaryAsset =
    platform === "windows"
      ? { label: "Download for Windows", url: ASSETS.windows, icon: Monitor }
      : platform === "mac_intel"
        ? { label: "Download for Mac (Intel)", url: ASSETS.mac_intel, icon: Apple }
        : { label: "Download for Mac (Apple Silicon)", url: ASSETS.mac_arm, icon: Apple };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Relay Control</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Desktop app for managing your AI agents
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <a href={primaryAsset.url} className="block">
            <Button className="w-full gap-2" size="lg">
              <Download className="h-4 w-4" />
              {primaryAsset.label}
            </Button>
          </a>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Other platforms
            </p>
            <div className="flex flex-col gap-1.5">
              {platform !== "mac_arm" && (
                <a
                  href={ASSETS.mac_arm}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  <Apple className="h-4 w-4 shrink-0" />
                  Mac (Apple Silicon)
                </a>
              )}
              {platform !== "mac_intel" && (
                <a
                  href={ASSETS.mac_intel}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  <Apple className="h-4 w-4 shrink-0" />
                  Mac (Intel)
                </a>
              )}
              {platform !== "windows" && (
                <a
                  href={ASSETS.windows}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  <Monitor className="h-4 w-4 shrink-0" />
                  Windows
                </a>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Already have the app?{" "}
          <a href="/" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Open dashboard
          </a>
        </p>
      </div>
    </div>
  );
}
