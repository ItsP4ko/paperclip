-- Fix: restore owner role for company creators whose membership_role was
-- downgraded to 'member' by ensureMembership during invite re-acceptance.
-- Identifies the first human member of each company (by created_at) and
-- ensures they have 'owner' role.
UPDATE company_memberships
SET membership_role = 'owner', updated_at = NOW()
WHERE id IN (
  SELECT DISTINCT ON (company_id) id
  FROM company_memberships
  WHERE principal_type = 'user' AND status = 'active'
  ORDER BY company_id, created_at ASC
)
AND (membership_role IS NULL OR membership_role != 'owner');
