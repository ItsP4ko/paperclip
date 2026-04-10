-- 0064_global_search.sql
-- Add full-text search vectors to issues, agents, projects, heartbeat_run_events

-- ============================================================
-- ISSUES
-- ============================================================
ALTER TABLE issues ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION issues_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.identifier, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS issues_search_vector_trigger ON issues;
CREATE TRIGGER issues_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, identifier, description ON issues
  FOR EACH ROW EXECUTE FUNCTION issues_search_vector_update();

CREATE INDEX IF NOT EXISTS issues_search_vector_idx ON issues USING gin(search_vector);

UPDATE issues SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(identifier, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B')
WHERE search_vector IS NULL;

-- ============================================================
-- AGENTS
-- ============================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION agents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.role, '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agents_search_vector_trigger ON agents;
CREATE TRIGGER agents_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, role ON agents
  FOR EACH ROW EXECUTE FUNCTION agents_search_vector_update();

CREATE INDEX IF NOT EXISTS agents_search_vector_idx ON agents USING gin(search_vector);

UPDATE agents SET search_vector =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(role, '')), 'B')
WHERE search_vector IS NULL;

-- ============================================================
-- PROJECTS
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION projects_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_search_vector_trigger ON projects;
CREATE TRIGGER projects_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description ON projects
  FOR EACH ROW EXECUTE FUNCTION projects_search_vector_update();

CREATE INDEX IF NOT EXISTS projects_search_vector_idx ON projects USING gin(search_vector);

UPDATE projects SET search_vector =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B')
WHERE search_vector IS NULL;

-- ============================================================
-- HEARTBEAT_RUN_EVENTS
-- ============================================================
ALTER TABLE heartbeat_run_events ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION hre_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.message, '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hre_search_vector_trigger ON heartbeat_run_events;
CREATE TRIGGER hre_search_vector_trigger
  BEFORE INSERT ON heartbeat_run_events
  FOR EACH ROW EXECUTE FUNCTION hre_search_vector_update();

CREATE INDEX IF NOT EXISTS hre_search_vector_idx ON heartbeat_run_events USING gin(search_vector);

-- Backfill in batches of 10000 to avoid locking
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE heartbeat_run_events
    SET search_vector = setweight(to_tsvector('english', COALESCE(message, '')), 'B')
    WHERE id IN (
      SELECT id FROM heartbeat_run_events WHERE search_vector IS NULL LIMIT batch_size
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;
