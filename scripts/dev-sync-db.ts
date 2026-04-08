#!/usr/bin/env tsx
/**
 * Syncs the public schema from Supabase (production) → local Docker postgres.
 * Usage: pnpm dev:sync-db
 *
 * Source:  DATABASE_URL from root .env (Supabase)
 * Target:  postgres://paperclip:paperclip@localhost:5432/paperclip
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LOCAL_DB = "postgres://paperclip:paperclip@localhost:5432/paperclip";

// Read root .env to get Supabase DATABASE_URL
function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
}

const env = readEnv(resolve(ROOT, ".env"));
const SOURCE_DB = env["DATABASE_URL"];

if (!SOURCE_DB) {
  console.error("❌  DATABASE_URL not found in root .env");
  process.exit(1);
}

console.log("🔄  Syncing Supabase → local Docker postgres...");
console.log(`    Source: ${SOURCE_DB.replace(/:([^:@]+)@/, ":***@")}`);
console.log(`    Target: ${LOCAL_DB}`);

try {
  // 1. Dump only the public schema (data + structure) from Supabase
  console.log("\n📦  Dumping public schema from Supabase...");
  execSync(
    `pg_dump "${SOURCE_DB}" \
      --schema=public \
      --no-owner \
      --no-acl \
      --no-privileges \
      -F c \
      -f /tmp/paperclip-supabase-dump.pgdump`,
    { stdio: "inherit" }
  );

  // 2. Drop and recreate public schema on local to get a clean slate
  console.log("\n🗑️   Resetting local public schema...");
  execSync(
    `psql "${LOCAL_DB}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`,
    { stdio: "inherit" }
  );

  // 3. Restore into local
  console.log("\n📥  Restoring into local Docker postgres...");
  execSync(
    `pg_restore \
      --no-owner \
      --no-acl \
      --no-privileges \
      -d "${LOCAL_DB}" \
      /tmp/paperclip-supabase-dump.pgdump`,
    { stdio: "inherit" }
  );

  console.log("\n✅  Sync complete. Local DB is now a copy of Supabase.");
} catch (err) {
  console.error("\n❌  Sync failed:", err);
  process.exit(1);
}
