-- Add (company_id, status) composite index on heartbeat_runs.
--
-- Queries like getActiveRunForAgent and listPendingLocalRuns filter by status
-- on every heartbeat/scheduler tick. Without this index Postgres has to scan
-- heartbeat_runs in full, and the cost grows unboundedly as the table ages.
--
-- NOTE on applying to a live database:
-- The drizzle migrator wraps every statement in a transaction, so this file
-- uses a plain CREATE INDEX which briefly holds a SHARE lock on the table
-- while the index builds. That is fine for fresh/testing environments.
-- For a large production table, apply manually with CONCURRENTLY OUTSIDE the
-- migrator (Supabase SQL editor is fine), then let the migrator mark this
-- migration as applied on its next run:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS
--     "heartbeat_runs_company_status_idx"
--     ON "heartbeat_runs" ("company_id","status");

CREATE INDEX IF NOT EXISTS "heartbeat_runs_company_status_idx"
  ON "heartbeat_runs" ("company_id","status");