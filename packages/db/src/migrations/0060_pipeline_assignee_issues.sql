-- 0060_pipeline_assignee_issues.sql
-- Add mixed assignee support and issue linking to pipeline steps

ALTER TABLE pipeline_steps
  ADD COLUMN assignee_type text,
  ADD COLUMN assignee_user_id text,
  ADD COLUMN issue_id uuid REFERENCES issues(id) ON DELETE SET NULL;

CREATE INDEX pipeline_steps_issue_idx ON pipeline_steps(issue_id);

-- Backfill: existing steps with agent_id get assignee_type = 'agent'
UPDATE pipeline_steps
  SET assignee_type = 'agent'
  WHERE agent_id IS NOT NULL;
