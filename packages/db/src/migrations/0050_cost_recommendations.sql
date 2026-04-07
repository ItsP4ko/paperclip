-- Cost Recommendations table for Phase 4: Cost Optimization Engine
CREATE TABLE IF NOT EXISTS "cost_recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "agent_id" uuid,
  "type" text NOT NULL,
  "severity" text NOT NULL,
  "estimated_savings_cents" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending',
  "details" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_recommendations_company_id_fk') THEN
  ALTER TABLE "cost_recommendations" ADD CONSTRAINT "cost_recommendations_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_recommendations_agent_id_fk') THEN
  ALTER TABLE "cost_recommendations" ADD CONSTRAINT "cost_recommendations_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_recommendations_company_idx" ON "cost_recommendations" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_recommendations_company_status_idx" ON "cost_recommendations" ("company_id", "status");
