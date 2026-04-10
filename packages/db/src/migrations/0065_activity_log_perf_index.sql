-- Composite covering index for the activity_log hot-path query in issueService.list().
--
-- The query filters on (company_id, entity_type, entity_id) and aggregates
-- MAX(created_at). Without a covering index, Postgres bitmap-ANDs two partial
-- indexes on every /companies/:id/issues request.
--
-- NOTE: For a large production activity_log table, apply CONCURRENTLY outside
-- the migrator (e.g. via Supabase SQL editor), then let the migrator mark this
-- migration applied on next run:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS
--     "activity_log_company_entity_created_idx"
--     ON "activity_log" ("company_id", "entity_type", "entity_id", "created_at");

CREATE INDEX IF NOT EXISTS "activity_log_company_entity_created_idx"
  ON "activity_log" ("company_id", "entity_type", "entity_id", "created_at");
