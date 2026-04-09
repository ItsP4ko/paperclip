-- Sprint tables
CREATE TABLE IF NOT EXISTS "sprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'planning',
  "start_date" date,
  "end_date" date,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sprint_issue_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sprint_id" uuid NOT NULL,
  "issue_id" uuid NOT NULL,
  "added_at" timestamp with time zone NOT NULL DEFAULT now(),
  "removed_at" timestamp with time zone,
  "removal_reason" text,
  "next_sprint_id" uuid
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "sprint_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sprints_company_id_fk') THEN
    ALTER TABLE "sprints" ADD CONSTRAINT "sprints_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sprint_issue_history_sprint_id_fk') THEN
    ALTER TABLE "sprint_issue_history" ADD CONSTRAINT "sprint_issue_history_sprint_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sprint_issue_history_issue_id_fk') THEN
    ALTER TABLE "sprint_issue_history" ADD CONSTRAINT "sprint_issue_history_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sprint_issue_history_next_sprint_id_fk') THEN
    ALTER TABLE "sprint_issue_history" ADD CONSTRAINT "sprint_issue_history_next_sprint_id_fk" FOREIGN KEY ("next_sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issues_sprint_id_fk') THEN
    ALTER TABLE "issues" ADD CONSTRAINT "issues_sprint_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sprints_company_status_idx" ON "sprints" ("company_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sprint_issue_history_sprint_idx" ON "sprint_issue_history" ("sprint_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sprint_issue_history_issue_idx" ON "sprint_issue_history" ("issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_company_sprint_idx" ON "issues" ("company_id", "sprint_id");
