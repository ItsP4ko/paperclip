-- Performance indexes: project_documents, goals, projects, auth tables

-- project_documents: had zero indexes
CREATE INDEX IF NOT EXISTS "project_documents_project_idx" ON "project_documents" ("project_id");
CREATE INDEX IF NOT EXISTS "project_documents_company_project_idx" ON "project_documents" ("company_id", "project_id");

-- goals: add composite status index and parent lookup
CREATE INDEX IF NOT EXISTS "goals_company_status_idx" ON "goals" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "goals_parent_idx" ON "goals" ("parent_id");

-- projects: add composite status index and goal lookup
CREATE INDEX IF NOT EXISTS "projects_company_status_idx" ON "projects" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "projects_goal_idx" ON "projects" ("goal_id");

-- auth: user email lookup
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_idx" ON "user" ("email");

-- auth: session lookups
CREATE INDEX IF NOT EXISTS "session_user_idx" ON "session" ("user_id");
CREATE INDEX IF NOT EXISTS "session_expires_at_idx" ON "session" ("expires_at");

-- auth: account lookups
CREATE INDEX IF NOT EXISTS "account_user_idx" ON "account" ("user_id");
CREATE INDEX IF NOT EXISTS "account_provider_account_idx" ON "account" ("provider_id", "account_id");

-- auth: verification lookups
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX IF NOT EXISTS "verification_expires_at_idx" ON "verification" ("expires_at");
