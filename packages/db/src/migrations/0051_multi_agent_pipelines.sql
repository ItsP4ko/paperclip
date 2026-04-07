-- Phase 5: Multi-Agent Pipelines
CREATE TABLE IF NOT EXISTS "pipelines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'draft',
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pipeline_id" uuid NOT NULL,
  "name" text NOT NULL,
  "agent_id" uuid,
  "depends_on" uuid[] NOT NULL DEFAULT '{}',
  "config" jsonb NOT NULL DEFAULT '{}',
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pipeline_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "project_id" uuid,
  "status" text NOT NULL DEFAULT 'running',
  "triggered_by" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_run_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pipeline_run_id" uuid NOT NULL,
  "pipeline_step_id" uuid NOT NULL,
  "issue_id" uuid,
  "status" text NOT NULL DEFAULT 'pending',
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipelines_company_id_fk') THEN
  ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_steps_pipeline_id_fk') THEN
  ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_steps_agent_id_fk') THEN
  ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_runs_pipeline_id_fk') THEN
  ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_runs_company_id_fk') THEN
  ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_run_steps_run_id_fk') THEN
  ALTER TABLE "pipeline_run_steps" ADD CONSTRAINT "pipeline_run_steps_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_run_steps_step_id_fk') THEN
  ALTER TABLE "pipeline_run_steps" ADD CONSTRAINT "pipeline_run_steps_step_id_fk" FOREIGN KEY ("pipeline_step_id") REFERENCES "public"."pipeline_steps"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_run_steps_issue_id_fk') THEN
  ALTER TABLE "pipeline_run_steps" ADD CONSTRAINT "pipeline_run_steps_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipelines_company_status_idx" ON "pipelines" ("company_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_steps_pipeline_idx" ON "pipeline_steps" ("pipeline_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_pipeline_created_idx" ON "pipeline_runs" ("pipeline_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_company_status_idx" ON "pipeline_runs" ("company_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_run_steps_run_idx" ON "pipeline_run_steps" ("pipeline_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_run_steps_issue_idx" ON "pipeline_run_steps" ("issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_run_steps_step_idx" ON "pipeline_run_steps" ("pipeline_step_id");
