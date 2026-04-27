import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";

const PULSE_STATUSES = new Set(["active", "running"]);

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
        statusBadge[status] ?? statusBadgeDefault,
        PULSE_STATUSES.has(status) && "dark:animate-neon-pulse",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
