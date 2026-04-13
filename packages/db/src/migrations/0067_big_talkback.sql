CREATE TABLE "cost_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"estimated_savings_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heartbeat_run_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"prompt" text,
	"status" text DEFAULT 'running' NOT NULL,
	"exit_code" integer,
	"started_at" timestamp with time zone DEFAULT now(),
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_state_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"sprint_id" uuid,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by_type" text NOT NULL,
	"changed_by_id" uuid NOT NULL,
	"duration_ms" bigint,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"search_vector" "tsvector",
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_injections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_entry_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"injected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_run_id" uuid NOT NULL,
	"pipeline_step_id" uuid NOT NULL,
	"issue_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"triggered_by" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"agent_id" uuid,
	"depends_on" uuid[] DEFAULT '{}' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"assignee_type" text,
	"assignee_user_id" text,
	"issue_id" uuid,
	"position_x" real,
	"position_y" real,
	"step_type" text DEFAULT 'action' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_member_local_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" text NOT NULL,
	"cwd" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprint_issue_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sprint_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removal_reason" text,
	"next_sprint_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"start_date" date,
	"end_date" date,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "agent_md" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "remote_control_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "session_status" text;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "idle_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "sprint_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "claude_md" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ai_context" text;--> statement-breakpoint
ALTER TABLE "cost_recommendations" ADD CONSTRAINT "cost_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_recommendations" ADD CONSTRAINT "cost_recommendations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_projects" ADD CONSTRAINT "group_projects_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_projects" ADD CONSTRAINT "group_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_run_turns" ADD CONSTRAINT "heartbeat_run_turns_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_run_turns" ADD CONSTRAINT "heartbeat_run_turns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_state_history" ADD CONSTRAINT "issue_state_history_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_state_history" ADD CONSTRAINT "issue_state_history_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_injections" ADD CONSTRAINT "knowledge_injections_knowledge_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("knowledge_entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_injections" ADD CONSTRAINT "knowledge_injections_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_injections" ADD CONSTRAINT "knowledge_injections_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_injections" ADD CONSTRAINT "knowledge_injections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run_steps" ADD CONSTRAINT "pipeline_run_steps_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run_steps" ADD CONSTRAINT "pipeline_run_steps_pipeline_step_id_pipeline_steps_id_fk" FOREIGN KEY ("pipeline_step_id") REFERENCES "public"."pipeline_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run_steps" ADD CONSTRAINT "pipeline_run_steps_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member_local_folders" ADD CONSTRAINT "project_member_local_folders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member_local_folders" ADD CONSTRAINT "project_member_local_folders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_issue_history" ADD CONSTRAINT "sprint_issue_history_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_issue_history" ADD CONSTRAINT "sprint_issue_history_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_issue_history" ADD CONSTRAINT "sprint_issue_history_next_sprint_id_sprints_id_fk" FOREIGN KEY ("next_sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_recommendations_company_idx" ON "cost_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cost_recommendations_company_status_idx" ON "cost_recommendations" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "group_memberships_group_principal_unique_idx" ON "group_memberships" USING btree ("group_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "group_memberships_group_role_idx" ON "group_memberships" USING btree ("group_id","role");--> statement-breakpoint
CREATE INDEX "group_memberships_principal_idx" ON "group_memberships" USING btree ("principal_type","principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_projects_group_project_unique_idx" ON "group_projects" USING btree ("group_id","project_id");--> statement-breakpoint
CREATE INDEX "group_projects_project_idx" ON "group_projects" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_company_name_unique_idx" ON "groups" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "groups_company_idx" ON "groups" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "heartbeat_run_turns_run_seq_idx" ON "heartbeat_run_turns" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "issue_state_history_issue_idx" ON "issue_state_history" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_state_history_sprint_idx" ON "issue_state_history" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "issue_state_history_changed_by_idx" ON "issue_state_history" USING btree ("changed_by_id");--> statement-breakpoint
CREATE INDEX "knowledge_entries_company_idx" ON "knowledge_entries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "knowledge_entries_company_agent_idx" ON "knowledge_entries" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX "knowledge_entries_company_pinned_idx" ON "knowledge_entries" USING btree ("company_id","pinned");--> statement-breakpoint
CREATE INDEX "knowledge_entries_company_category_idx" ON "knowledge_entries" USING btree ("company_id","category");--> statement-breakpoint
CREATE INDEX "knowledge_entries_search_vector_idx" ON "knowledge_entries" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "knowledge_injections_run_idx" ON "knowledge_injections" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "knowledge_injections_entry_idx" ON "knowledge_injections" USING btree ("knowledge_entry_id");--> statement-breakpoint
CREATE INDEX "knowledge_injections_company_agent_idx" ON "knowledge_injections" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX "pipeline_run_steps_run_idx" ON "pipeline_run_steps" USING btree ("pipeline_run_id");--> statement-breakpoint
CREATE INDEX "pipeline_run_steps_issue_idx" ON "pipeline_run_steps" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "pipeline_run_steps_step_idx" ON "pipeline_run_steps" USING btree ("pipeline_step_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_pipeline_created_idx" ON "pipeline_runs" USING btree ("pipeline_id","created_at");--> statement-breakpoint
CREATE INDEX "pipeline_runs_company_status_idx" ON "pipeline_runs" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "pipeline_steps_pipeline_idx" ON "pipeline_steps" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "pipelines_company_status_idx" ON "pipelines" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "project_documents_project_idx" ON "project_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_documents_company_project_idx" ON "project_documents" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_member_local_folders_project_member_idx" ON "project_member_local_folders" USING btree ("project_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "project_member_local_folders_company_idx" ON "project_member_local_folders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "project_member_local_folders_project_idx" ON "project_member_local_folders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sprint_issue_history_sprint_idx" ON "sprint_issue_history" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "sprint_issue_history_issue_idx" ON "sprint_issue_history" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "sprints_project_status_idx" ON "sprints" USING btree ("project_id","status");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_provider_account_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "goals_company_status_idx" ON "goals" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "goals_parent_idx" ON "goals" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "heartbeat_runs_company_status_idx" ON "heartbeat_runs" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "issues_company_sprint_idx" ON "issues" USING btree ("company_id","sprint_id");--> statement-breakpoint
CREATE INDEX "projects_company_status_idx" ON "projects" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "projects_goal_idx" ON "projects" USING btree ("goal_id");