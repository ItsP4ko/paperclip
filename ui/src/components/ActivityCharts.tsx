import type { HeartbeatRun, Issue, FinanceEvent } from "@paperclipai/shared";

/* ---- Utilities ---- */

export function getLast14Days(): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function toIsoDay(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function bucketIssuesByDay(
  issues: Pick<Issue, "status" | "createdAt" | "updatedAt">[],
  days: string[],
): Map<string, { created: number; completed: number }> {
  const bucket = new Map<string, { created: number; completed: number }>();
  for (const day of days) bucket.set(day, { created: 0, completed: 0 });
  for (const issue of issues) {
    const createdDay = toIsoDay(issue.createdAt);
    const createdEntry = bucket.get(createdDay);
    if (createdEntry) createdEntry.created++;
    if (issue.status === "done") {
      const completedDay = toIsoDay(issue.updatedAt);
      const doneEntry = bucket.get(completedDay);
      if (doneEntry) doneEntry.completed++;
    }
  }
  return bucket;
}

export function bucketFinanceEventsByDay(
  events: Pick<FinanceEvent, "amountCents" | "direction" | "occurredAt">[],
  days: string[],
): Map<string, number> {
  const bucket = new Map<string, number>();
  for (const day of days) bucket.set(day, 0);
  for (const event of events) {
    if (event.direction !== "debit") continue;
    const day = toIsoDay(event.occurredAt);
    const current = bucket.get(day);
    if (current !== undefined) bucket.set(day, current + event.amountCents);
  }
  return bucket;
}

export function groupIssuesByStatus(issues: Pick<Issue, "status">[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const issue of issues) {
    out[issue.status] = (out[issue.status] ?? 0) + 1;
  }
  return out;
}

export function collapseToTopN<T extends { name: string; value: number }>(
  rows: T[],
  n: number,
): { name: string; value: number }[] {
  const positive = rows.filter((r) => r.value > 0);
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted.map(({ name, value }) => ({ name, value }));
  const top = sorted.slice(0, n).map(({ name, value }) => ({ name, value }));
  const other = sorted.slice(n).reduce((sum, r) => sum + r.value, 0);
  return other > 0 ? [...top, { name: "Other", value: other }] : top;
}

/* ---- Sub-components ---- */

function DateLabels({ days }: { days: string[] }) {
  return (
    <div className="flex gap-[3px] mt-1.5">
      {days.map((day, i) => (
        <div key={day} className="flex-1 text-center">
          {(i === 0 || i === 6 || i === 13) ? (
            <span className="text-[9px] text-muted-foreground tabular-nums">{formatDayLabel(day)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-2">
      {items.map(item => (
        <span key={item.label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3 scan-line-card hover:border-accent transition-all duration-300">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {subtitle && <span className="text-[10px] text-muted-foreground/60">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---- Chart Components ---- */

export function TasksThroughputChart({ issues }: { issues: Issue[] }) {
  const days = getLast14Days();
  const bucket = bucketIssuesByDay(issues, days);
  const hasData = Array.from(bucket.values()).some((v) => v.created + v.completed > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground">No tasks yet</p>;

  const maxValue = Math.max(
    ...Array.from(bucket.values()).map((v) => Math.max(v.created, v.completed)),
    1,
  );

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map((day) => {
          const entry = bucket.get(day)!;
          return (
            <div
              key={day}
              className="flex-1 h-full flex items-end gap-px"
              title={`${day}: ${entry.created} created, ${entry.completed} completed`}
            >
              <div
                className="flex-1"
                style={{
                  height: `${(entry.created / maxValue) * 100}%`,
                  minHeight: entry.created > 0 ? 2 : 0,
                  backgroundColor: "#00E5FF",
                }}
              />
              <div
                className="flex-1"
                style={{
                  height: `${(entry.completed / maxValue) * 100}%`,
                  minHeight: entry.completed > 0 ? 2 : 0,
                  backgroundColor: "#39FF14",
                }}
              />
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend
        items={[
          { color: "#00E5FF", label: "Created" },
          { color: "#39FF14", label: "Completed" },
        ]}
      />
    </div>
  );
}

export function SpendPerDayChart({ events }: { events: FinanceEvent[] }) {
  const days = getLast14Days();
  const bucket = bucketFinanceEventsByDay(events, days);
  const values = days.map((d) => bucket.get(d) ?? 0);
  const hasData = values.some((v) => v > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground">No spend recorded</p>;

  const maxValue = Math.max(...values, 1);

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map((day, i) => {
          const cents = values[i];
          const heightPct = (cents / maxValue) * 100;
          return (
            <div
              key={day}
              className="flex-1 h-full flex flex-col justify-end"
              title={`${day}: $${(cents / 100).toFixed(2)}`}
            >
              {cents > 0 ? (
                <div style={{ height: `${heightPct}%`, minHeight: 2, backgroundColor: "#f59e0b" }} />
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}

export function RunActivityChart({ runs }: { runs: HeartbeatRun[] }) {
  const days = getLast14Days();

  const grouped = new Map<string, { succeeded: number; failed: number; other: number }>();
  for (const day of days) grouped.set(day, { succeeded: 0, failed: 0, other: 0 });
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    if (run.status === "succeeded") entry.succeeded++;
    else if (run.status === "failed" || run.status === "timed_out") entry.failed++;
    else entry.other++;
  }

  const maxValue = Math.max(...Array.from(grouped.values()).map(v => v.succeeded + v.failed + v.other), 1);
  const hasData = Array.from(grouped.values()).some(v => v.succeeded + v.failed + v.other > 0);

  if (!hasData) return <p className="text-xs text-muted-foreground">No runs yet</p>;

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = entry.succeeded + entry.failed + entry.other;
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" title={`${day}: ${total} runs`}>
              {total > 0 ? (
                <div className="flex flex-col-reverse gap-px overflow-hidden" style={{ height: `${heightPct}%`, minHeight: 2 }}>
                  {entry.succeeded > 0 && <div style={{ flex: entry.succeeded, backgroundColor: "#39FF14" }} />}
                  {entry.failed > 0 && <div style={{ flex: entry.failed, backgroundColor: "#ff4444" }} />}
                  {entry.other > 0 && <div style={{ flex: entry.other, backgroundColor: "#555" }} />}
                </div>
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}

const priorityColors: Record<string, string> = {
  critical: "#ff4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#00E5FF",
};

const priorityOrder = ["critical", "high", "medium", "low"] as const;

export function PriorityChart({ issues }: { issues: { priority: string; createdAt: Date }[] }) {
  const days = getLast14Days();
  const grouped = new Map<string, Record<string, number>>();
  for (const day of days) grouped.set(day, { critical: 0, high: 0, medium: 0, low: 0 });
  for (const issue of issues) {
    const day = new Date(issue.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    if (issue.priority in entry) entry[issue.priority]++;
  }

  const maxValue = Math.max(...Array.from(grouped.values()).map(v => Object.values(v).reduce((a, b) => a + b, 0)), 1);
  const hasData = Array.from(grouped.values()).some(v => Object.values(v).reduce((a, b) => a + b, 0) > 0);

  if (!hasData) return <p className="text-xs text-muted-foreground">No issues</p>;

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = Object.values(entry).reduce((a, b) => a + b, 0);
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" title={`${day}: ${total} issues`}>
              {total > 0 ? (
                <div className="flex flex-col-reverse gap-px overflow-hidden" style={{ height: `${heightPct}%`, minHeight: 2 }}>
                  {priorityOrder.map(p => entry[p] > 0 ? (
                    <div key={p} style={{ flex: entry[p], backgroundColor: priorityColors[p] }} />
                  ) : null)}
                </div>
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={priorityOrder.map(p => ({ color: priorityColors[p], label: p.charAt(0).toUpperCase() + p.slice(1) }))} />
    </div>
  );
}

const statusColors: Record<string, string> = {
  todo: "#00E5FF",
  in_progress: "#a855f7",
  in_review: "#7c3aed",
  done: "#39FF14",
  blocked: "#ff4444",
  cancelled: "#555",
  backlog: "#444",
};

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
  backlog: "Backlog",
};

export function IssueStatusChart({ issues }: { issues: { status: string; createdAt: Date }[] }) {
  const days = getLast14Days();
  const allStatuses = new Set<string>();
  const grouped = new Map<string, Record<string, number>>();
  for (const day of days) grouped.set(day, {});
  for (const issue of issues) {
    const day = new Date(issue.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    entry[issue.status] = (entry[issue.status] ?? 0) + 1;
    allStatuses.add(issue.status);
  }

  const statusOrder = ["todo", "in_progress", "in_review", "done", "blocked", "cancelled", "backlog"].filter(s => allStatuses.has(s));
  const maxValue = Math.max(...Array.from(grouped.values()).map(v => Object.values(v).reduce((a, b) => a + b, 0)), 1);
  const hasData = allStatuses.size > 0;

  if (!hasData) return <p className="text-xs text-muted-foreground">No issues</p>;

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = Object.values(entry).reduce((a, b) => a + b, 0);
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" title={`${day}: ${total} issues`}>
              {total > 0 ? (
                <div className="flex flex-col-reverse gap-px overflow-hidden" style={{ height: `${heightPct}%`, minHeight: 2 }}>
                  {statusOrder.map(s => (entry[s] ?? 0) > 0 ? (
                    <div key={s} style={{ flex: entry[s], backgroundColor: statusColors[s] ?? "#6b7280" }} />
                  ) : null)}
                </div>
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={statusOrder.map(s => ({ color: statusColors[s] ?? "#6b7280", label: statusLabels[s] ?? s }))} />
    </div>
  );
}

export function SuccessRateChart({ runs }: { runs: HeartbeatRun[] }) {
  const days = getLast14Days();
  const grouped = new Map<string, { succeeded: number; total: number }>();
  for (const day of days) grouped.set(day, { succeeded: 0, total: 0 });
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    entry.total++;
    if (run.status === "succeeded") entry.succeeded++;
  }

  const hasData = Array.from(grouped.values()).some(v => v.total > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground">No runs yet</p>;

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const rate = entry.total > 0 ? entry.succeeded / entry.total : 0;
          const color = entry.total === 0 ? undefined : rate >= 0.8 ? "#10b981" : rate >= 0.5 ? "#eab308" : "#ef4444";
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" title={`${day}: ${entry.total > 0 ? Math.round(rate * 100) : 0}% (${entry.succeeded}/${entry.total})`}>
              {entry.total > 0 ? (
                <div style={{ height: `${rate * 100}%`, minHeight: 2, backgroundColor: color }} />
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}
