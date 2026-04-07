import { Download } from "lucide-react";

const RELEASES_BASE = "https://github.com/ItsP4ko/paperclip/releases/latest";
const MAC_ARM_URL = `${RELEASES_BASE}/download/Relay.Control_aarch64.dmg`;

function getDownloadUrl(): string {
  const isArm = /arm64|aarch64/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform ?? ""
  );
  // Only Mac ARM has a direct build; all others go to the releases page
  return isArm ? MAC_ARM_URL : RELEASES_BASE;
}

export function DesktopDownloadButton() {
  // Don't show if already running inside the desktop app
  const isTauri =
    typeof window !== "undefined" &&
    ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
  if (isTauri) return null;

  return (
    <a
      href={getDownloadUrl()}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Download Desktop App"
    >
      <Download className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Download Desktop App</span>
    </a>
  );
}
