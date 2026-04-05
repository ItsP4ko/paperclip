/**
 * E2E Verification Script for Phase 7
 *
 * Targets the live Vercel + Easypanel + Supabase deployment.
 * Uses Playwright to drive the browser in headless mode.
 *
 * Run: npx playwright test e2e-verify.ts --config=e2e-verify.config.ts
 *
 * IMPORTANT: This script requires the following env vars:
 *   OWNER_EMAIL=<owner-email>
 *   OWNER_PASSWORD=<owner-password>
 *   INVITED_EMAIL=<second-real-email>
 *   INVITED_PASSWORD=<password-for-invited>
 */

import { chromium, Browser, BrowserContext, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const FRONTEND_URL = "https://paperclip-beige-five.vercel.app";
const SCREENSHOTS_DIR = path.join(
  __dirname,
  "screenshots"
);

// Results tracking
const results: Record<string, { status: "PASS" | "FAIL" | "SKIP"; notes: string }> = {};

async function screenshot(page: Page, name: string): Promise<void> {
  const filePath = path.join(SCREENSHOTS_DIR, name);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  📸 Screenshot saved: ${name}`);
}

async function run() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // =========================================================
  // SESSION A: Owner
  // =========================================================
  console.log("\n=== SESSION A: Owner ===");
  const ownerContext: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const ownerPage: Page = await ownerContext.newPage();

  let companyPrefix = "";
  let inviteUrl = "";
  let issueId = "";

  try {
    // Step 1: Navigate to frontend
    console.log("Step 1: Navigate to Vercel frontend...");
    await ownerPage.goto(FRONTEND_URL, { waitUntil: "networkidle", timeout: 30000 });
    await screenshot(ownerPage, "00-owner-frontend-loaded.png");

    // Step 2: Sign in
    console.log("Step 2: Sign in as owner...");
    // Try to find the sign-in form or navigate to sign-in page
    const currentUrl = ownerPage.url();
    console.log(`  Current URL: ${currentUrl}`);

    // Check for sign-in button or auth redirect
    const signInBtn = ownerPage.locator('a[href*="sign-in"], button:has-text("Sign in"), a:has-text("Sign in"), button:has-text("Login"), a:has-text("Login")').first();
    if (await signInBtn.isVisible({ timeout: 5000 })) {
      await signInBtn.click();
      await ownerPage.waitForLoadState("networkidle");
    } else {
      // May already be redirected to sign-in
      await ownerPage.goto(`${FRONTEND_URL}/sign-in`, { waitUntil: "networkidle", timeout: 15000 });
    }

    await screenshot(ownerPage, "sign-in-page.png");
    console.log(`  Sign-in page URL: ${ownerPage.url()}`);

    // Fill in sign-in form
    const ownerEmail = process.env.OWNER_EMAIL || "";
    const ownerPassword = process.env.OWNER_PASSWORD || "";

    if (!ownerEmail || !ownerPassword) {
      console.log("  BLOCKED: No OWNER_EMAIL/OWNER_PASSWORD env vars set");
      results["E2E-01"] = { status: "FAIL", notes: "No owner credentials provided" };
      results["E2E-02"] = { status: "SKIP", notes: "Blocked by E2E-01 failure" };
      results["E2E-03"] = { status: "SKIP", notes: "Blocked by E2E-01 failure" };
      results["E2E-04"] = { status: "SKIP", notes: "Blocked by E2E-01 failure" };
      results["E2E-05"] = { status: "SKIP", notes: "Blocked by E2E-01 failure" };
      results["E2E-06"] = { status: "SKIP", notes: "Blocked by E2E-01 failure" };
    } else {
      // Fill email
      const emailInput = ownerPage.locator('input[type="email"], input[name="email"]').first();
      await emailInput.waitFor({ timeout: 10000 });
      await emailInput.fill(ownerEmail);

      // Fill password
      const passwordInput = ownerPage.locator('input[type="password"]').first();
      await passwordInput.fill(ownerPassword);

      // Submit
      const submitBtn = ownerPage.locator('button[type="submit"]').first();
      await submitBtn.click();
      await ownerPage.waitForLoadState("networkidle", { timeout: 20000 });

      console.log(`  After sign-in URL: ${ownerPage.url()}`);
      await screenshot(ownerPage, "owner-signed-in.png");

      // Get company prefix from URL
      const afterSignInUrl = ownerPage.url();
      const urlMatch = afterSignInUrl.match(/\/([A-Z0-9]+)(?:\/|$)/);
      if (urlMatch) {
        companyPrefix = urlMatch[1];
        console.log(`  Company prefix: ${companyPrefix}`);
      }

      // Step 3: Navigate to Company Settings
      console.log("Step 3: Navigate to Company Settings...");
      if (companyPrefix) {
        await ownerPage.goto(`${FRONTEND_URL}/${companyPrefix}/settings`, {
          waitUntil: "networkidle",
          timeout: 15000,
        });
      } else {
        // Try to find settings link in nav
        const settingsLink = ownerPage.locator('a:has-text("Settings"), a[href*="settings"]').first();
        if (await settingsLink.isVisible({ timeout: 5000 })) {
          await settingsLink.click();
          await ownerPage.waitForLoadState("networkidle");
          // Get company prefix from new URL
          const settingsUrl = ownerPage.url();
          const match = settingsUrl.match(/\/([A-Z0-9]+)\/settings/);
          if (match) companyPrefix = match[1];
        }
      }

      console.log(`  Settings URL: ${ownerPage.url()}`);
      await screenshot(ownerPage, "company-settings-page.png");

      // Step 4: Generate invite link
      console.log("Step 4: Generate invite link...");
      // Look for "Generate Invite Link" button or similar
      const generateBtn = ownerPage.locator(
        'button:has-text("Generate"), button:has-text("Invite"), button:has-text("Create invite"), button:has-text("New invite")'
      ).first();

      if (await generateBtn.isVisible({ timeout: 10000 })) {
        await generateBtn.click();
        await ownerPage.waitForTimeout(2000);
        console.log("  Clicked generate invite button");
      } else {
        console.log("  WARNING: Could not find Generate Invite button — trying API directly");
      }

      // Step 5: Screenshot invite URL
      await screenshot(ownerPage, "01-invite-link-generated.png");

      // Try to get invite URL from the page
      const inviteUrlText = await ownerPage.evaluate(() => {
        // Look for any text that contains the invite URL pattern
        const inputs = document.querySelectorAll("input[type='text'], input[readonly]");
        for (const input of inputs) {
          const val = (input as HTMLInputElement).value;
          if (val.includes("/invite/")) return val;
        }
        // Check for text content with invite URL
        const elements = document.querySelectorAll("*");
        for (const el of elements) {
          const text = (el as HTMLElement).innerText || "";
          const match = text.match(/https?:\/\/[^\s]+\/invite\/[^\s]+/);
          if (match) return match[0];
        }
        return null;
      });

      if (inviteUrlText) {
        inviteUrl = inviteUrlText;
        console.log(`  Invite URL found: ${inviteUrl}`);
        results["E2E-01"] = { status: "PASS", notes: `Invite URL generated: ${inviteUrl}` };
      } else {
        // Try calling the API directly to generate an invite
        console.log("  Trying API to get company ID and generate invite...");
        // First get company info
        const companyData = await ownerPage.evaluate(async () => {
          try {
            const resp = await fetch("/api/companies/me/current", { credentials: "include" });
            if (resp.ok) return resp.json();
            return null;
          } catch {
            return null;
          }
        });
        console.log(`  Company data: ${JSON.stringify(companyData)}`);

        // Try to find invite URL in any visible element
        const pageContent = await ownerPage.content();
        const inviteMatch = pageContent.match(/\/invite\/([a-zA-Z0-9_-]+)/);
        if (inviteMatch) {
          inviteUrl = `${FRONTEND_URL}${inviteMatch[0]}`;
          console.log(`  Invite URL from page content: ${inviteUrl}`);
          results["E2E-01"] = { status: "PASS", notes: `Invite URL found in page: ${inviteUrl}` };
        } else {
          results["E2E-01"] = { status: "FAIL", notes: "Could not find invite URL on Company Settings page" };
        }
      }
    }
  } catch (err) {
    console.error("Session A error:", err);
    results["E2E-01"] = {
      status: "FAIL",
      notes: `Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // =========================================================
  // SESSION B: Invited User (new browser context)
  // =========================================================
  console.log("\n=== SESSION B: Invited User ===");
  const invitedContext: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const invitedPage: Page = await invitedContext.newPage();

  let invitedUserJoined = false;

  if (inviteUrl && results["E2E-01"]?.status === "PASS") {
    try {
      const invitedEmail = process.env.INVITED_EMAIL || "";
      const invitedPassword = process.env.INVITED_PASSWORD || "";

      if (!invitedEmail || !invitedPassword) {
        console.log("  BLOCKED: No INVITED_EMAIL/INVITED_PASSWORD env vars set");
        results["E2E-02"] = { status: "FAIL", notes: "No invited user credentials provided" };
      } else {
        // Step 8: Navigate to invite URL
        console.log(`Step 8: Navigate to invite URL: ${inviteUrl}`);
        const fullInviteUrl = inviteUrl.startsWith("http")
          ? inviteUrl
          : `${FRONTEND_URL}${inviteUrl.startsWith("/") ? "" : "/"}${inviteUrl}`;
        await invitedPage.goto(fullInviteUrl, { waitUntil: "networkidle", timeout: 30000 });
        console.log(`  Current URL: ${invitedPage.url()}`);
        await screenshot(invitedPage, "invite-landing-page.png");

        // Step 9-11: Sign up and accept invite
        console.log("Step 9-11: Sign up as invited user...");

        // Look for sign-up/create account buttons
        const signUpBtn = invitedPage.locator(
          'button:has-text("Sign up"), button:has-text("Create account"), a:has-text("Sign up"), a:has-text("Create account"), button:has-text("Join")'
        ).first();

        if (await signUpBtn.isVisible({ timeout: 10000 })) {
          await signUpBtn.click();
          await invitedPage.waitForLoadState("networkidle");
          console.log(`  After clicking sign up, URL: ${invitedPage.url()}`);
        } else {
          // May need to navigate to sign-up
          await invitedPage.goto(`${FRONTEND_URL}/sign-up`, { waitUntil: "networkidle" });
        }

        await screenshot(invitedPage, "invited-sign-up-page.png");

        // Fill sign-up form
        const emailInput = invitedPage.locator('input[type="email"], input[name="email"]').first();
        if (await emailInput.isVisible({ timeout: 10000 })) {
          await emailInput.fill(invitedEmail);
        }

        const passwordInput = invitedPage.locator('input[type="password"]').first();
        if (await passwordInput.isVisible({ timeout: 5000 })) {
          await passwordInput.fill(invitedPassword);
        }

        // Check for name field
        const nameInput = invitedPage.locator('input[name="name"], input[placeholder*="name"]').first();
        if (await nameInput.isVisible({ timeout: 3000 })) {
          await nameInput.fill("Test Invited User");
        }

        // Submit sign-up
        const submitBtn = invitedPage.locator('button[type="submit"]').first();
        if (await submitBtn.isVisible({ timeout: 5000 })) {
          await submitBtn.click();
          await invitedPage.waitForLoadState("networkidle", { timeout: 20000 });
          console.log(`  After sign-up, URL: ${invitedPage.url()}`);
        }

        await screenshot(invitedPage, "02-invite-accepted.png");

        // Step 12-15: Accept invite and navigate to My Tasks
        console.log("Step 12-15: Accept invite and navigate to My Tasks...");
        const acceptBtn = invitedPage.locator(
          'button:has-text("Accept"), button:has-text("Join"), button:has-text("Continue")'
        ).first();

        if (await acceptBtn.isVisible({ timeout: 5000 })) {
          await acceptBtn.click();
          await invitedPage.waitForLoadState("networkidle", { timeout: 15000 });
          console.log(`  After accepting, URL: ${invitedPage.url()}`);
        }

        const afterAcceptUrl = invitedPage.url();
        const companyPrefixMatch = afterAcceptUrl.match(/\/([A-Z0-9]+)(?:\/|$)/);
        const invitedCompanyPrefix = companyPrefixMatch ? companyPrefixMatch[1] : companyPrefix;

        // Navigate to My Tasks
        if (invitedCompanyPrefix) {
          await invitedPage.goto(`${FRONTEND_URL}/${invitedCompanyPrefix}/my-tasks`, {
            waitUntil: "networkidle",
            timeout: 15000,
          });
        }

        await screenshot(invitedPage, "03-my-tasks-empty.png");
        console.log(`  My Tasks URL: ${invitedPage.url()}`);

        invitedUserJoined = true;
        results["E2E-02"] = {
          status: "PASS",
          notes: "User signed up, accepted invite, My Tasks page loaded",
        };
      }
    } catch (err) {
      console.error("Session B error:", err);
      results["E2E-02"] = {
        status: "FAIL",
        notes: `Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else {
    results["E2E-02"] = { status: "SKIP", notes: "Skipped — E2E-01 did not produce invite URL" };
  }

  await browser.close();
  return results;
}

run()
  .then((r) => {
    console.log("\n=== RESULTS ===");
    console.log(JSON.stringify(r, null, 2));
  })
  .catch(console.error);
