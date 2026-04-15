import type { SprintStatus } from "../constants.js";

export interface Sprint {
  id: string;
  projectId: string;
  groupId: string | null;
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

export interface IssueStateHistoryEntry {
  id: string;
  issueId: string;
  sprintId: string | null;
  fromStatus: string | null;
  toStatus: string;
  changedByType: string;
  changedById: string;
  changedByName: string | null;
  durationMs: number | null;
  changedAt: Date;
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

export interface SprintSpillSummary {
  sprintId: string;
  name: string;
  completed: number;
  spilledOver: number;
  total: number;
  spilledToSprintId: string | null;
  spilledToSprintName: string | null;
}

export interface UserSprintActivity {
  userId: string;
  name: string | null;
  completed: number;
  avgCycleTimeMs: number | null;
  totalMoves: number;
}

export interface ProjectSprintMetrics {
  totalSprints: number;
  completedSprints: number;
  avgVelocity: number;
  spillOverRate: number;
  avgCycleTimeMs: number | null;
  totalCompleted: number;
  sprintSummaries: SprintSpillSummary[];
  avgTimePerStatus: Record<string, number>;
  userActivity: UserSprintActivity[];
  recentStateLog: IssueStateHistoryEntry[];
  spillOverAlerts: Array<{ issueId: string; identifier: string | null; title: string; sprintCount: number }>;
}
