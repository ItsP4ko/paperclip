-- Knowledge Base tables for Agent Memory (Phase 3 v2.0)
CREATE TABLE IF NOT EXISTS "knowledge_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "agent_id" uuid,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "category" text,
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "pinned" boolean NOT NULL DEFAULT false,
  "source_type" text NOT NULL DEFAULT 'manual',
  "source_ref" text,
  "search_vector" tsvector,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_injections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "knowledge_entry_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "agent_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "injected_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_entries_company_id_companies_id_fk') THEN
  ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_entries_agent_id_agents_id_fk') THEN
  ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_injections_knowledge_entry_id_fk') THEN
  ALTER TABLE "knowledge_injections" ADD CONSTRAINT "knowledge_injections_knowledge_entry_id_fk" FOREIGN KEY ("knowledge_entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_injections_run_id_fk') THEN
  ALTER TABLE "knowledge_injections" ADD CONSTRAINT "knowledge_injections_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_injections_agent_id_fk') THEN
  ALTER TABLE "knowledge_injections" ADD CONSTRAINT "knowledge_injections_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_injections_company_id_fk') THEN
  ALTER TABLE "knowledge_injections" ADD CONSTRAINT "knowledge_injections_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entries_company_idx" ON "knowledge_entries" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entries_company_agent_idx" ON "knowledge_entries" ("company_id", "agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entries_company_pinned_idx" ON "knowledge_entries" ("company_id", "pinned");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entries_company_category_idx" ON "knowledge_entries" ("company_id", "category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entries_search_vector_idx" ON "knowledge_entries" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_injections_run_idx" ON "knowledge_injections" ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_injections_entry_idx" ON "knowledge_injections" ("knowledge_entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_injections_company_agent_idx" ON "knowledge_injections" ("company_id", "agent_id");
--> statement-breakpoint
-- Trigger to auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION knowledge_entries_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
                       setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS knowledge_entries_search_vector_trigger ON "knowledge_entries";
CREATE TRIGGER knowledge_entries_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, content ON "knowledge_entries"
  FOR EACH ROW
  EXECUTE FUNCTION knowledge_entries_search_vector_update();
