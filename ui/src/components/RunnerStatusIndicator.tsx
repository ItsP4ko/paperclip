import { useEffect, useState } from "react";

type RunnerStatus = "running" | "stopped" | "not_started" | "unknown";

// Detect Tauri environment (works for both Tauri v1 and v2).
function isTauriEnv(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI__" in window || "__TAURI_INTERNALS__" in window)
  );
}

export function RunnerStatusIndicator() {
  const [status, setStatus] = useState<RunnerStatus>("not_started");

  useEffect(() => {
    if (!isTauriEnv()) return;

    async function checkStatus() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const s = await invoke<RunnerStatus>("get_runner_status");
        setStatus(s);
      } catch {
        setStatus("unknown");
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!isTauriEnv()) return null;

  const isRunning = status === "running";

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${
          isRunning ? "bg-green-500" : "bg-gray-400"
        }`}
      />
      <span className="text-xs text-muted-foreground">
        Runner {isRunning ? "active" : "inactive"}
      </span>
    </div>
  );
}
