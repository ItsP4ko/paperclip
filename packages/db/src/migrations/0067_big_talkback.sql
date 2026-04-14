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
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_projects" ADD CONSTRAINT "group_projects_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_projects" ADD CONSTRAINT "group_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_memberships_group_principal_unique_idx" ON "group_memberships" USING btree ("group_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "group_memberships_group_role_idx" ON "group_memberships" USING btree ("group_id","role");--> statement-breakpoint
CREATE INDEX "group_memberships_principal_idx" ON "group_memberships" USING btree ("principal_type","principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_projects_group_project_unique_idx" ON "group_projects" USING btree ("group_id","project_id");--> statement-breakpoint
CREATE INDEX "group_projects_project_idx" ON "group_projects" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_company_name_unique_idx" ON "groups" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "groups_company_idx" ON "groups" USING btree ("company_id");
