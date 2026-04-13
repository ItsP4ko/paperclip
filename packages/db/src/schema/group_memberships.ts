import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { groups } from "./groups.js";

export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    role: text("role").notNull().default("member"),
    addedByUserId: text("added_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    groupPrincipalUniqueIdx: uniqueIndex("group_memberships_group_principal_unique_idx").on(
      table.groupId,
      table.principalType,
      table.principalId,
    ),
    groupRoleIdx: index("group_memberships_group_role_idx").on(table.groupId, table.role),
    principalIdx: index("group_memberships_principal_idx").on(table.principalType, table.principalId),
  }),
);
