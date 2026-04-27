import { Download, Monitor, Apple, ExternalLink } from "lucide-react";
import { Button } from "@/ui/components/ui/button";

const REPO = "ItsP4ko/paperclip";
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const MAC_DMG_URL = `https://github.com/${REPO}/releases/latest/download/Relay.Control_aarch64.dmg`;

function detectPlatform(): "mac" | "windows" | "other" {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac";
  return "other";
}

export function DownloadPage() {
  const platform = detectPlatform();

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
          {platform === "mac" ? (
            <a href={MAC_DMG_URL} className="block">
              <Button className="w-full gap-2" size="lg">
                <Download className="h-4 w-4" />
                Download for macOS
              </Button>
            </a>
          ) : platform === "windows" ? (
            <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className="block">
              <Button className="w-full gap-2" size="lg">
                <ExternalLink className="h-4 w-4" />
                Download for Windows
              </Button>
            </a>
          ) : (
            <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className="block">
              <Button className="w-full gap-2" size="lg">
                <ExternalLink className="h-4 w-4" />
                View latest release on GitHub
              </Button>
            </a>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              All downloads
            </p>
            <div className="flex flex-col gap-1.5">
              <a
                href={MAC_DMG_URL}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                <Apple className="h-4 w-4 shrink-0" />
                macOS (Apple Silicon / Intel via Rosetta)
              </a>
              <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/50 cursor-not-allowed select-none">
                <Monitor className="h-4 w-4 shrink-0" />
                Windows — coming soon
              </div>
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
