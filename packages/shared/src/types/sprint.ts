import type { SprintStatus } from "../constants.js";

export interface Sprint {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SprintIssueHistoryEntry {
  id: string;
  sprintId: string;
  issueId: string;
  addedAt: Date;
  removedAt: Date | null;
  removalReason: "completed" | "spilled_over" | "removed" | null;
  nextSprintId: string | null;
}

export interface SprintIssueTiming {
  issueId: string;
  identifier: string | null;
  title: string;
  status: string;
  cycleTimeMs: number | null;
  spillCount: number;
  nextSprintId: string | null;
  nextSprintName: string | null;
}

export interface SprintMetrics {
  total: number;
  byStatus: Record<string, number>;
  completionRate: number;
  spilledOver: number;
  avgCycleTimeMs: number | null;
  issueTimings: SprintIssueTiming[];
}
