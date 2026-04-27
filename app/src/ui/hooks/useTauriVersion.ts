import { useEffect, useState } from "react";

function isTauriEnv(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI__" in window || "__TAURI_INTERNALS__" in window)
  );
}

/**
 * Returns the Tauri desktop app version when running inside Tauri,
 * or null when running in the browser.
 */
export function useTauriVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriEnv()) return;
    import("@tauri-apps/api/app").then(({ getVersion }) => {
      getVersion().then(setVersion).catch(() => {});
    });
  }, []);

  return version;
}
