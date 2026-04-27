/**
 * Returns true when running inside the Tauri desktop app.
 * Use this to gate features that should only be available on desktop.
 */
export function isTauriEnv(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI__" in window || "__TAURI_INTERNALS__" in window)
  );
}
