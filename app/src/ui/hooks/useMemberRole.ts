import { useQuery } from "@tanstack/react-query";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";

export type MemberRole = "owner" | "developer" | "member" | null;

/**
 * Returns the current user's membership role within a company.
 * - "owner"     → full access + role management
 * - "developer" → can manage agents, create/edit routines, assign to agents
 * - "member"    → restricted: no agents, no admin pages, view-only routines
 * - null        → loading or no membership found (treat as member)
 */
export function useMemberRole(companyId: string | null) {
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    staleTime: Infinity,
  });

  const { data: members } = useQuery({
    queryKey: queryKeys.access.members(companyId!),
    queryFn: () => accessApi.listMembers(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const role = (members?.find((m) => m.principalId === currentUserId)?.membershipRole ?? null) as MemberRole;

  return {
    role,
    isOwner: role === "owner",
    isDeveloper: role === "developer",
    isMember: role === "member" || role === null,
    /** owner or developer — can manage agents, create routines, assign to agents */
    canManageAgents: role === "owner" || role === "developer",
    /** only owner (and admin via canManage) can change roles */
    canChangeRoles: role === "owner",
  };
}
