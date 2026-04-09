-- 0061_pipeline_react_flow.sql
-- Add canvas position + step type for React Flow editor

ALTER TABLE pipeline_steps
  ADD COLUMN position_x real,
  ADD COLUMN position_y real,
  ADD COLUMN step_type text NOT NULL DEFAULT 'action';
