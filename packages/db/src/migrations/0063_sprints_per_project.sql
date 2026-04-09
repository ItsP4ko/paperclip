-- Remove existing sprints data (no prod data yet) and restructure
DELETE FROM sprints;
--> statement-breakpoint

-- Add project_id
ALTER TABLE "sprints" ADD COLUMN "project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE cascade;
--> statement-breakpoint

-- Drop company_id FK and column
ALTER TABLE "sprints" DROP CONSTRAINT IF EXISTS "sprints_company_id_fk";
--> statement-breakpoint
ALTER TABLE "sprints" DROP COLUMN IF EXISTS "company_id";
--> statement-breakpoint

-- Replace index
DROP INDEX IF EXISTS "sprints_company_status_idx";
--> statement-breakpoint
CREATE INDEX "sprints_project_status_idx" ON "sprints" ("project_id", "status");
--> statement-breakpoint

-- New table: issue state history
CREATE TABLE IF NOT EXISTS "issue_state_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "issue_id" uuid NOT NULL,
  "sprint_id" uuid,
  "from_status" text,
  "to_status" text NOT NULL,
  "changed_by_type" text NOT NULL,
  "changed_by_id" uuid NOT NULL,
  "duration_ms" bigint,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "issue_state_history"
  ADD CONSTRAINT "issue_state_history_issue_id_fk"
  FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "issue_state_history"
  ADD CONSTRAINT "issue_state_history_sprint_id_fk"
  FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null;
--> statement-breakpoint

CREATE INDEX "issue_state_history_issue_idx" ON "issue_state_history" ("issue_id");
--> statement-breakpoint
CREATE INDEX "issue_state_history_sprint_idx" ON "issue_state_history" ("sprint_id");
--> statement-breakpoint
CREATE INDEX "issue_state_history_changed_by_idx" ON "issue_state_history" ("changed_by_id");
