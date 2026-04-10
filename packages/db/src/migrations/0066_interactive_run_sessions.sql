-- Interactive run sessions: allow users to chat with running agents
-- by sending follow-up messages that resume the same CLI session.

-- Add session lifecycle columns to heartbeat_runs
ALTER TABLE heartbeat_runs ADD COLUMN session_status TEXT;
ALTER TABLE heartbeat_runs ADD COLUMN idle_since TIMESTAMPTZ;

-- Turn history: each user message or agent execution is a turn
CREATE TABLE IF NOT EXISTS heartbeat_run_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES heartbeat_runs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,           -- 'agent' | 'human'
  prompt TEXT,                  -- user message (when role = 'human')
  status TEXT NOT NULL DEFAULT 'running',  -- running | succeeded | failed
  exit_code INTEGER,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX heartbeat_run_turns_run_seq_idx ON heartbeat_run_turns(run_id, seq);
