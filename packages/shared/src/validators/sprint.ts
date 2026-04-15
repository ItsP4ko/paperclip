import { z } from "zod";
import { SPRINT_STATUSES } from "../constants.js";

export const createSprintSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  groupId: z.string().uuid(),
});

export type CreateSprint = z.infer<typeof createSprintSchema>;

export const updateSprintSchema = createSprintSchema.extend({
  status: z.enum(SPRINT_STATUSES).optional(),
}).partial();

export type UpdateSprint = z.infer<typeof updateSprintSchema>;

export const completeSprintSchema = z.object({
  spillStrategy: z.enum(["backlog", "next_sprint"]),
  nextSprintId: z.string().uuid().optional(),
});

export type CompleteSprint = z.infer<typeof completeSprintSchema>;

export const addIssueToSprintSchema = z.object({
  issueId: z.string().uuid(),
});

export type AddIssueToSprint = z.infer<typeof addIssueToSprintSchema>;
