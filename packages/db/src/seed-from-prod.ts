/**
 * Sync key tables from real Supabase → local Docker postgres for testing.
 *
 * After sync, patches one claude_local agent with test agentMd and one project
 * with test claudeMd so the CLI runner injection can be verified end-to-end.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=<supabase-url> \
 *   DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip \
 *   pnpm db:seed-local
 */

import { createHash } from "node:crypto";
import postgres from "postgres";

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.DATABASE_URL;

if (!SOURCE_URL) throw new Error("SOURCE_DATABASE_URL is required (real Supabase URL)");
if (!TARGET_URL) throw new Error("DATABASE_URL is required (local Docker postgres URL)");

const src = postgres(SOURCE_URL, { max: 3, ssl: "require", onnotice: () => {} });
const tgt = postgres(TARGET_URL, { max: 3, onnotice: () => {} });

// Known test runner token — use this with the CLI runner --api-key flag
const TEST_RUNNER_TOKEN = "pclip-test-local-runner-00000000000";
const TEST_RUNNER_TOKEN_HASH = createHash("sha256").update(TEST_RUNNER_TOKEN).digest("hex");

function log(msg: string) {
  console.log(`  ${msg}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function copyTable(
  table: string,
  columns: string,
  opts: { onConflict?: string } = {},
) {
  const rows = await src.unsafe(`SELECT ${columns} FROM "${table}"`);
  if (rows.length === 0) {
    log(`  (no rows) ${table}`);
    return 0;
  }
  const conflictClause = opts.onConflict ?? "ON CONFLICT DO NOTHING";
  const colList = columns === "*"
    ? Object.keys(rows[0]!).map((c) => `"${c}"`).join(", ")
    : columns.split(",").map((c) => `"${c.trim()}"`).join(", ");

  const placeholders = rows
    .map(
      (_, ri) =>
        `(${Object.keys(rows[0]!).map((_, ci) => `$${ri * Object.keys(rows[0]!).length + ci + 1}`).join(", ")})`,
    )
    .join(", ");
  const values = rows.flatMap((r) => Object.values(r));

  await tgt.unsafe(
    `INSERT INTO "${table}" (${colList}) VALUES ${placeholders} ${conflictClause}`,
    values as never,
  );
  return rows.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("Starting sync from prod → local Docker postgres...\n");

// 1. Clear target (disable FK checks during truncate)
log("Clearing target tables...");
await tgt.unsafe(`SET session_replication_role = replica`);
await tgt.unsafe(`
  TRUNCATE TABLE
    board_api_keys,
    agent_api_keys,
    heartbeat_run_events,
    heartbeat_runs,
    issues,
    issue_comments,
    issue_approvals,
    project_goals,
    project_documents,
    projects,
    goals,
    agents,
    company_memberships,
    companies,
    account,
    session,
    verification,
    "user"
  CASCADE
`);
await tgt.unsafe(`SET session_replication_role = DEFAULT`);
log("Tables cleared.\n");

// 2. Auth users
log("Syncing users...");
const userRows = await src.unsafe(`SELECT id, name, email, email_verified, image, created_at, updated_at FROM "user"`);
if (userRows.length > 0) {
  for (const u of userRows) {
    await tgt`INSERT INTO "user" ${tgt([u])} ON CONFLICT DO NOTHING`;
  }
}
log(`  → ${userRows.length} users`);

// 3. Auth accounts (OAuth credentials — needed to log in)
log("Syncing accounts...");
const accountRows = await src.unsafe(
  `SELECT id, account_id, provider_id, user_id, access_token, refresh_token, id_token,
          access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at
   FROM "account"`,
);
for (const a of accountRows) {
  await tgt`INSERT INTO "account" ${tgt([a])} ON CONFLICT DO NOTHING`;
}
log(`  → ${accountRows.length} accounts`);

// 4. Companies
log("Syncing companies...");
const companyRows = await src.unsafe(`SELECT * FROM "companies"`);
for (const c of companyRows) {
  await tgt`INSERT INTO "companies" ${tgt([c])} ON CONFLICT DO NOTHING`;
}
log(`  → ${companyRows.length} companies`);

// 5. Company memberships
log("Syncing memberships...");
const membershipRows = await src.unsafe(`SELECT * FROM "company_memberships"`);
for (const m of membershipRows) {
  await tgt`INSERT INTO "company_memberships" ${tgt([m])} ON CONFLICT DO NOTHING`;
}
log(`  → ${membershipRows.length} memberships`);

// 6. Agents (exclude agent_md — new column not in prod yet, patched below)
log("Syncing agents...");
const agentRows = await src.unsafe(`
  SELECT id, company_id, name, role, title, icon, status, reports_to,
         capabilities, adapter_type, adapter_config, runtime_config,
         budget_monthly_cents, spent_monthly_cents, pause_reason, paused_at,
         permissions, last_heartbeat_at, metadata, created_at, updated_at
  FROM "agents"
`);
// Disable FK temporarily for self-referential reportsTo
await tgt.unsafe(`SET session_replication_role = replica`);
for (const a of agentRows) {
  await tgt`INSERT INTO "agents" ${tgt([a])} ON CONFLICT DO NOTHING`;
}
await tgt.unsafe(`SET session_replication_role = DEFAULT`);
log(`  → ${agentRows.length} agents`);

// 7. Goals
log("Syncing goals...");
const goalRows = await src.unsafe(`SELECT * FROM "goals"`);
for (const g of goalRows) {
  await tgt`INSERT INTO "goals" ${tgt([g])} ON CONFLICT DO NOTHING`;
}
log(`  → ${goalRows.length} goals`);

// 8. Projects (exclude claude_md — might be new column, patched below)
log("Syncing projects...");
const projectRows = await src.unsafe(`
  SELECT id, company_id, goal_id, name, description, status,
         lead_agent_id, target_date, color, pause_reason, paused_at,
         ai_context, execution_workspace_policy, archived_at, created_at, updated_at
  FROM "projects"
`);
for (const p of projectRows) {
  await tgt`INSERT INTO "projects" ${tgt([p])} ON CONFLICT DO NOTHING`;
}
log(`  → ${projectRows.length} projects`);

// ---------------------------------------------------------------------------
// Patch test data for CLI injection testing
// ---------------------------------------------------------------------------

console.log("\nPatching test data for CLI injection test...");

// Patch first claude_local agent with test agentMd
const [patchedAgent] = await tgt`
  UPDATE agents
  SET agent_md = ${
    "# Test Agent Instructions (DB-injected)\n\n" +
    "Estas instrucciones fueron inyectadas desde la DB global por el runner local.\n\n" +
    "- Responde siempre en español\n" +
    "- Confirma que el agentMd fue inyectado correctamente\n"
  }
  WHERE id = (
    SELECT id FROM agents
    WHERE adapter_type = 'claude_local' AND agent_md IS NULL
    ORDER BY created_at
    LIMIT 1
  )
  RETURNING id, name, company_id
`;

if (patchedAgent) {
  log(`✅ Patched agentMd on: "${patchedAgent.name}" (${patchedAgent.id})`);

  // Patch the project associated with this agent's company
  const [patchedProject] = await tgt`
    UPDATE projects
    SET claude_md = ${
      "# Test Project CLAUDE.md (DB-injected)\n\n" +
      "Este CLAUDE.md fue inyectado desde la DB global por el runner local.\n\n" +
      "Cualquier agente que trabaje en este proyecto debe confirmar que recibió estas instrucciones.\n"
    }
    WHERE id = (
      SELECT id FROM projects
      WHERE company_id = ${patchedAgent.company_id} AND claude_md IS NULL
      ORDER BY created_at
      LIMIT 1
    )
    RETURNING id, name
  `;
  if (patchedProject) {
    log(`✅ Patched claudeMd on: "${patchedProject.name}" (${patchedProject.id})`);
  } else {
    log("⚠️  No project found to patch claudeMd (no projects without claude_md)");
  }
} else {
  log("⚠️  No claude_local agent found to patch agentMd — create one in the UI first");
}

// ---------------------------------------------------------------------------
// Create test board API key for CLI runner
// ---------------------------------------------------------------------------

console.log("\nCreating test runner API key...");
const [firstUser] = await tgt`SELECT id, email FROM "user" LIMIT 1`;
if (firstUser) {
  await tgt`
    INSERT INTO board_api_keys (user_id, name, key_hash, expires_at, created_at)
    VALUES (
      ${firstUser.id},
      ${"Local Test Runner Token (seed-from-prod)"},
      ${TEST_RUNNER_TOKEN_HASH},
      ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)},
      ${new Date()}
    )
    ON CONFLICT (key_hash) DO NOTHING
  `;
  log(`✅ Runner token created for user: ${firstUser.email}`);
} else {
  log("⚠️  No users found — cannot create runner API key");
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log("\n✅ Sync complete!\n");
console.log("Runner token (use with --api-key):".padEnd(40));
console.log(`  ${TEST_RUNNER_TOKEN}\n`);
console.log("CLI runner command:");
console.log(
  `  DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip \\\n` +
  `  pnpm relaycontrol runner start \\\n` +
  `    --api-base http://localhost:3000 \\\n` +
  `    --api-key ${TEST_RUNNER_TOKEN} \\\n` +
  `    --verbose\n`,
);

await src.end();
await tgt.end();
process.exit(0);
