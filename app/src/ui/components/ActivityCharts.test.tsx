import { describe, it, expect } from "vitest";
import {
  bucketIssuesByDay,
  bucketFinanceEventsByDay,
  groupIssuesByStatus,
  collapseToTopN,
  getLast14Days,
} from "./ActivityCharts";

describe("bucketIssuesByDay", () => {
  const days = ["2026-04-10", "2026-04-11"];

  it("counts created and completed issues per day", () => {
    const issues = [
      { status: "todo", createdAt: "2026-04-10T10:00:00Z", updatedAt: "2026-04-10T10:00:00Z" },
      { status: "done", createdAt: "2026-04-09T10:00:00Z", updatedAt: "2026-04-11T15:00:00Z" },
      { status: "done", createdAt: "2026-04-11T08:00:00Z", updatedAt: "2026-04-11T20:00:00Z" },
      { status: "cancelled", createdAt: "2026-04-10T09:00:00Z", updatedAt: "2026-04-11T09:00:00Z" },
    ];
    const result = bucketIssuesByDay(issues as never, days);
    expect(result.get("2026-04-10")).toEqual({ created: 2, completed: 0 });
    expect(result.get("2026-04-11")).toEqual({ created: 1, completed: 2 });
  });

  it("ignores issues outside the day window", () => {
    const issues = [{ status: "done", createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-04-01T00:00:00Z" }];
    const result = bucketIssuesByDay(issues as never, days);
    expect(result.get("2026-04-10")).toEqual({ created: 0, completed: 0 });
    expect(result.get("2026-04-11")).toEqual({ created: 0, completed: 0 });
  });
});

describe("bucketFinanceEventsByDay", () => {
  const days = ["2026-04-10", "2026-04-11"];

  it("sums debit amountCents per day", () => {
    const events = [
      { amountCents: 100, direction: "debit", occurredAt: "2026-04-10T10:00:00Z" },
      { amountCents: 250, direction: "debit", occurredAt: "2026-04-10T22:00:00Z" },
      { amountCents: 50, direction: "debit", occurredAt: "2026-04-11T01:00:00Z" },
    ];
    const result = bucketFinanceEventsByDay(events as never, days);
    expect(result.get("2026-04-10")).toBe(350);
    expect(result.get("2026-04-11")).toBe(50);
  });

  it("ignores credit events", () => {
    const events = [
      { amountCents: 100, direction: "debit", occurredAt: "2026-04-10T10:00:00Z" },
      { amountCents: 500, direction: "credit", occurredAt: "2026-04-10T10:00:00Z" },
    ];
    const result = bucketFinanceEventsByDay(events as never, days);
    expect(result.get("2026-04-10")).toBe(100);
  });

  it("ignores events outside the window", () => {
    const events = [{ amountCents: 999, direction: "debit", occurredAt: "2020-01-01T00:00:00Z" }];
    const result = bucketFinanceEventsByDay(events as never, days);
    expect(result.get("2026-04-10")).toBe(0);
  });
});

describe("groupIssuesByStatus", () => {
  it("returns counts per status", () => {
    const issues = [
      { status: "todo" },
      { status: "todo" },
      { status: "in_progress" },
      { status: "done" },
    ];
    const result = groupIssuesByStatus(issues as never);
    expect(result).toEqual({ todo: 2, in_progress: 1, done: 1 });
  });

  it("returns empty object for no issues", () => {
    expect(groupIssuesByStatus([] as never)).toEqual({});
  });
});

describe("collapseToTopN", () => {
  const rows = [
    { name: "a", value: 100 },
    { name: "b", value: 60 },
    { name: "c", value: 40 },
    { name: "d", value: 20 },
    { name: "e", value: 10 },
    { name: "f", value: 5 },
  ];

  it("keeps top N rows and collapses rest into 'Other'", () => {
    const result = collapseToTopN(rows, 3);
    expect(result).toEqual([
      { name: "a", value: 100 },
      { name: "b", value: 60 },
      { name: "c", value: 40 },
      { name: "Other", value: 35 },
    ]);
  });

  it("returns input unchanged when length <= n", () => {
    const result = collapseToTopN(rows.slice(0, 2), 3);
    expect(result).toEqual([
      { name: "a", value: 100 },
      { name: "b", value: 60 },
    ]);
  });

  it("filters zero-value rows before grouping", () => {
    const withZero = [...rows.slice(0, 3), { name: "g", value: 0 }];
    const result = collapseToTopN(withZero, 5);
    expect(result).toEqual([
      { name: "a", value: 100 },
      { name: "b", value: 60 },
      { name: "c", value: 40 },
    ]);
  });
});

describe("getLast14Days", () => {
  it("returns 14 ISO date strings in ascending order", () => {
    const days = getLast14Days();
    expect(days).toHaveLength(14);
    expect(days[0] < days[13]).toBe(true);
    expect(days[13]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
