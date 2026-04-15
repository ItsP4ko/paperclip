ALTER TABLE "sprints" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sprints_group_status_idx" ON "sprints" USING btree ("group_id","status");
