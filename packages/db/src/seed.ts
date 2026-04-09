import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./client.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const db = createDb(url);
const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("Seeding database...");

// 1. Load and execute prod data SQL
const sqlPath = join(__dirname, "seed-data.sql");
const sql = readFileSync(sqlPath, "utf-8");

const client = (db as unknown as { $client: { unsafe: (q: string) => Promise<unknown> } }).$client;
await client.unsafe(sql);
console.log("Prod data seeded (companies, agents, projects, issues, etc.)");

// 2. Create dev user via better-auth signup API
const signupUrl = process.env.AUTH_BASE_URL ?? "http://localhost:3100";
const email = "paco.semino@gmail.com";
const password = "paperclip123";

const res = await fetch(`${signupUrl}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Origin": signupUrl },
  body: JSON.stringify({ name: "Paco Semino", email, password }),
});

if (res.ok) {
  console.log(`Dev user created: ${email} / ${password}`);
} else {
  const body = await res.text();
  if (body.includes("already") || body.includes("UNIQUE")) {
    console.log(`Dev user already exists: ${email}`);
  } else {
    console.warn(`Dev user signup (${res.status}): ${body}`);
  }
}

// 3. Grant instance_admin to dev user
const { authUsers, instanceUserRoles } = await import("./schema/index.js");
const { eq } = await import("drizzle-orm");

const devUser = await db.select().from(authUsers).where(eq(authUsers.email, email)).then(r => r[0]);
if (devUser) {
  await db.insert(instanceUserRoles).values({ userId: devUser.id, role: "instance_admin" }).onConflictDoNothing();
  console.log("Dev user granted instance_admin role");

  // 4. Add dev user as member of all companies
  const { companies, companyMemberships } = await import("./schema/index.js");
  const allCompanies = await db.select({ id: companies.id }).from(companies);
  for (const company of allCompanies) {
    await db.insert(companyMemberships).values({
      companyId: company.id,
      principalType: "user",
      principalId: devUser.id,
      status: "active",
      membershipRole: "owner",
    }).onConflictDoNothing();
  }
  console.log(`Dev user added to ${allCompanies.length} companies`);
}

// 5. Clean up instance_user_roles pointing to non-existent users (prod IDs)
await client.unsafe(`
  DELETE FROM instance_user_roles
  WHERE user_id NOT IN (SELECT id FROM "user");
`);

console.log("Seed complete");
process.exit(0);
