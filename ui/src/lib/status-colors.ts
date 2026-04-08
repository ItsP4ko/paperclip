/**
 * Canonical status & priority color definitions.
 *
 * Every component that renders a status indicator (StatusIcon, StatusBadge,
 * agent status dots, etc.) should import from here so colors stay consistent.
 */

// ---------------------------------------------------------------------------
// Issue status colors
// ---------------------------------------------------------------------------

/** StatusIcon circle: text + border classes */
export const issueStatusIcon: Record<string, string> = {
  backlog: "text-muted-foreground border-muted-foreground",
  todo: "text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400",
  in_progress: "text-yellow-600 border-yellow-600 dark:text-yellow-400 dark:border-yellow-400",
  in_review: "text-violet-600 border-violet-600 dark:text-violet-400 dark:border-violet-400",
  done: "text-green-600 border-green-600 dark:text-green-400 dark:border-green-400",
  cancelled: "text-neutral-500 border-neutral-500",
  blocked: "text-red-600 border-red-600 dark:text-red-400 dark:border-red-400",
};

export const issueStatusIconDefault = "text-muted-foreground border-muted-foreground";

/** Text-only color for issue statuses (dropdowns, labels) */
export const issueStatusText: Record<string, string> = {
  backlog: "text-muted-foreground",
  todo: "text-blue-600 dark:text-blue-400",
  in_progress: "text-yellow-600 dark:text-yellow-400",
  in_review: "text-violet-600 dark:text-violet-400",
  done: "text-green-600 dark:text-green-400",
  cancelled: "text-neutral-500",
  blocked: "text-red-600 dark:text-red-400",
};

export const issueStatusTextDefault = "text-muted-foreground";

// ---------------------------------------------------------------------------
// Badge colors — used by StatusBadge for all entity types
// ---------------------------------------------------------------------------

export const statusBadge: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:border dark:border-primary dark:text-primary dark:bg-transparent dark:shadow-[var(--glow-green)]",
  running: "bg-cyan-100 text-cyan-700 dark:border dark:border-accent dark:text-accent dark:bg-transparent dark:shadow-[var(--glow-cyan)]",
  paused: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  idle: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  archived: "bg-muted text-muted-foreground",
  planned: "bg-muted text-muted-foreground",
  achieved: "bg-green-100 text-green-700 dark:border dark:border-primary dark:text-primary dark:bg-transparent dark:shadow-[var(--glow-green)]",
  completed: "bg-green-100 text-green-700 dark:border dark:border-primary dark:text-primary dark:bg-transparent dark:shadow-[var(--glow-green)]",
  failed: "bg-red-100 text-red-700 dark:border dark:border-destructive dark:text-destructive dark:bg-transparent",
  timed_out: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  succeeded: "bg-green-100 text-green-700 dark:border dark:border-primary dark:text-primary dark:bg-transparent dark:shadow-[var(--glow-green)]",
  error: "bg-red-100 text-red-700 dark:border dark:border-destructive dark:text-destructive dark:bg-transparent",
  terminated: "bg-red-100 text-red-700 dark:border dark:border-destructive dark:text-destructive dark:bg-transparent",
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  revision_requested: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:border dark:border-primary dark:text-primary dark:bg-transparent dark:shadow-[var(--glow-green)]",
  rejected: "bg-red-100 text-red-700 dark:border dark:border-destructive dark:text-destructive dark:bg-transparent",
  backlog: "bg-muted text-muted-foreground",
  todo: "bg-blue-100 text-blue-700 dark:border dark:border-accent dark:text-accent dark:bg-transparent dark:shadow-[var(--glow-cyan)]",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  in_review: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  blocked: "bg-red-100 text-red-700 dark:border dark:border-destructive dark:text-destructive dark:bg-transparent",
  done: "bg-green-100 text-green-700 dark:border dark:border-primary dark:text-primary dark:bg-transparent dark:shadow-[var(--glow-green)]",
  cancelled: "bg-muted text-muted-foreground",
};

export const statusBadgeDefault = "bg-muted text-muted-foreground";

// ---------------------------------------------------------------------------
// Agent status dot — solid background for small indicator dots
// ---------------------------------------------------------------------------

export const agentStatusDot: Record<string, string> = {
  running: "bg-accent animate-pulse",
  active: "bg-primary",
  paused: "bg-yellow-400",
  idle: "bg-yellow-400",
  pending_approval: "bg-amber-400",
  error: "bg-destructive",
  archived: "bg-neutral-400",
};

export const agentStatusDotDefault = "bg-neutral-400";

// ---------------------------------------------------------------------------
// Priority colors
// ---------------------------------------------------------------------------

export const priorityColor: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-blue-600 dark:text-blue-400",
};

export const priorityColorDefault = "text-yellow-600 dark:text-yellow-400";
