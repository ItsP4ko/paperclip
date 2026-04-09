import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  createRemotePinAuthMiddleware,
  createRemotePinAuthHandler,
  parseCookies,
  validatePinSession,
  SESSION_COOKIE,
} from "../middleware/remote-pin-auth.js";

const TEST_PIN = "123456";

// ---------------------------------------------------------------------------
// Unit tests: parseCookies
// ---------------------------------------------------------------------------

describe("parseCookies", () => {
  it("returns empty object for undefined header", () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it("parses a single cookie", () => {
    expect(parseCookies("rc_session=abc123")).toEqual({ rc_session: "abc123" });
  });

  it("parses multiple cookies", () => {
    const result = parseCookies("a=1; b=2; c=3");
    expect(result).toEqual({ a: "1", b: "2", c: "3" });
  });
});

// ---------------------------------------------------------------------------
// Unit tests: validatePinSession
// ---------------------------------------------------------------------------

describe("validatePinSession", () => {
  it("rejects empty string", () => {
    expect(validatePinSession("", TEST_PIN)).toBe(false);
  });

  it("rejects malformed value without dot", () => {
    expect(validatePinSession("no-dot-here", TEST_PIN)).toBe(false);
  });

  it("rejects expired session (> 24 h)", () => {
    // Create a session value with a timestamp far in the past
    const crypto = require("node:crypto");
    const oldTs = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    const sig = crypto.createHmac("sha256", TEST_PIN).update(String(oldTs)).digest("hex");
    expect(validatePinSession(`${oldTs}.${sig}`, TEST_PIN)).toBe(false);
  });

  it("rejects wrong PIN", () => {
    const crypto = require("node:crypto");
    const ts = Date.now();
    const sig = crypto.createHmac("sha256", "wrong-pin").update(String(ts)).digest("hex");
    expect(validatePinSession(`${ts}.${sig}`, TEST_PIN)).toBe(false);
  });

  it("accepts a valid session created with the correct PIN", () => {
    const crypto = require("node:crypto");
    const ts = Date.now();
    const sig = crypto.createHmac("sha256", TEST_PIN).update(String(ts)).digest("hex");
    expect(validatePinSession(`${ts}.${sig}`, TEST_PIN)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: PIN middleware + handler (full Express flow)
// ---------------------------------------------------------------------------

function createPinApp(pin: string) {
  const app = express();
  app.use(express.json());
  app.use(createRemotePinAuthMiddleware(pin));
  app.post("/api/remote-pin-auth", express.json(), createRemotePinAuthHandler(pin));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/dashboard", (_req, res) => res.send("dashboard"));
  return app;
}

describe("Remote PIN auth middleware", () => {
  it("always allows /api/remote-pin-auth through", async () => {
    const app = createPinApp(TEST_PIN);
    const res = await request(app)
      .post("/api/remote-pin-auth")
      .send({ pin: TEST_PIN });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // Should set the session cookie
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(setCookie[0]).toContain(SESSION_COOKIE);
  });

  it("rejects wrong PIN with 401", async () => {
    const app = createPinApp(TEST_PIN);
    const res = await request(app)
      .post("/api/remote-pin-auth")
      .send({ pin: "000000" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid PIN");
  });

  it("returns 401 for API calls without session cookie", async () => {
    const app = createPinApp(TEST_PIN);
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("PIN authentication");
  });

  it("serves PIN entry HTML for non-API routes without session cookie", async () => {
    const app = createPinApp(TEST_PIN);
    const res = await request(app).get("/dashboard");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Remote Control");
    expect(res.text).toContain("6-digit PIN");
  });

  it("allows API calls with valid session cookie", async () => {
    const app = createPinApp(TEST_PIN);

    // Step 1: Authenticate with PIN
    const authRes = await request(app)
      .post("/api/remote-pin-auth")
      .send({ pin: TEST_PIN });
    expect(authRes.status).toBe(200);

    // Extract the session cookie
    const setCookieHeader = authRes.headers["set-cookie"];
    const cookieString = Array.isArray(setCookieHeader)
      ? setCookieHeader[0]
      : setCookieHeader;
    const cookieValue = cookieString.split(";")[0]; // e.g. "rc_session=..."

    // Step 2: Use the cookie to access an API endpoint
    const apiRes = await request(app)
      .get("/api/health")
      .set("Cookie", cookieValue);
    expect(apiRes.status).toBe(200);
    expect(apiRes.body).toEqual({ ok: true });
  });

  it("overrides CSP for PIN HTML page to allow inline scripts/styles", async () => {
    const app = createPinApp(TEST_PIN);
    const res = await request(app).get("/dashboard");
    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("script-src 'unsafe-inline'");
    expect(csp).toContain("style-src 'unsafe-inline'");
  });
});

// ---------------------------------------------------------------------------
// Integration: PIN promotion to board actor
// ---------------------------------------------------------------------------

describe("PIN-to-board actor promotion", () => {
  function createFullApp(pin: string) {
    const app = express();
    app.use(express.json());

    // PIN middleware
    app.use(createRemotePinAuthMiddleware(pin));
    app.post("/api/remote-pin-auth", express.json(), createRemotePinAuthHandler(pin));

    // Simulate actor middleware: sets type "none" (like authenticated mode without session)
    app.use((req, _res, next) => {
      req.actor = { type: "none", source: "none" };
      next();
    });

    // PIN promotion middleware (mirrors what app.ts now does)
    app.use((req, _res, next) => {
      if (req.actor.type === "none") {
        const cookies = parseCookies(req.headers.cookie);
        if (validatePinSession(cookies[SESSION_COOKIE] ?? "", pin)) {
          req.actor = {
            type: "board",
            userId: "local-board",
            isInstanceAdmin: true,
            source: "remote_pin",
          };
        }
      }
      next();
    });

    // Test endpoint that requires board access
    app.get("/api/test-board", (req, res) => {
      if (req.actor.type !== "board") {
        res.status(403).json({ error: "Board access required" });
        return;
      }
      res.json({
        actor: req.actor.type,
        source: req.actor.source,
        userId: req.actor.userId,
      });
    });

    return app;
  }

  it("unauthenticated requests remain type none and get 403", async () => {
    const app = createFullApp(TEST_PIN);
    const res = await request(app).get("/api/test-board");
    expect(res.status).toBe(401); // PIN middleware returns 401 for unauthenticated API calls
  });

  it("PIN-authenticated requests are promoted to board actor", async () => {
    const app = createFullApp(TEST_PIN);

    // Authenticate
    const authRes = await request(app)
      .post("/api/remote-pin-auth")
      .send({ pin: TEST_PIN });
    const cookie = authRes.headers["set-cookie"][0].split(";")[0];

    // Access board-protected endpoint
    const boardRes = await request(app)
      .get("/api/test-board")
      .set("Cookie", cookie);
    expect(boardRes.status).toBe(200);
    expect(boardRes.body).toEqual({
      actor: "board",
      source: "remote_pin",
      userId: "local-board",
    });
  });

  it("expired PIN session is not promoted", async () => {
    const app = createFullApp(TEST_PIN);

    // Create an expired cookie manually
    const crypto = require("node:crypto");
    const oldTs = Date.now() - 25 * 60 * 60 * 1000;
    const sig = crypto.createHmac("sha256", TEST_PIN).update(String(oldTs)).digest("hex");
    const expiredCookie = `${SESSION_COOKIE}=${oldTs}.${sig}`;

    const res = await request(app)
      .get("/api/test-board")
      .set("Cookie", expiredCookie);
    // PIN middleware should reject it (401 for API paths)
    expect(res.status).toBe(401);
  });
});
