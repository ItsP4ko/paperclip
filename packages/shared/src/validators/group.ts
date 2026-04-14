import { z } from "zod";
import { GROUP_MEMBERSHIP_ROLES } from "../constants.js";

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
});
export type CreateGroup = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
});
export type UpdateGroup = z.infer<typeof updateGroupSchema>;

export const addGroupMembersSchema = z.object({
  members: z
    .array(
      z.object({
        principalType: z.string().min(1),
        principalId: z.string().min(1),
      }),
    )
    .min(1)
    .max(50),
});
export type AddGroupMembers = z.infer<typeof addGroupMembersSchema>;

export const updateGroupMemberRoleSchema = z.object({
  role: z.enum(GROUP_MEMBERSHIP_ROLES),
});
export type UpdateGroupMemberRole = z.infer<typeof updateGroupMemberRoleSchema>;

export const addGroupProjectsSchema = z.object({
  projectIds: z.array(z.string().uuid()).min(1).max(50),
});
export type AddGroupProjects = z.infer<typeof addGroupProjectsSchema>;
