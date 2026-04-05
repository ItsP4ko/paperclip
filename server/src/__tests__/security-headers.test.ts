import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { securityHeaders } from "../middleware/security-headers.js";

function createTestApp() {
  const app = express();
  app.use(securityHeaders);
  app.get("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("securityHeaders middleware", () => {
  it("sets x-frame-options header to DENY", async () => {
    const app = createTestApp();
    const res = await request(app).get("/test");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets strict-transport-security header with max-age=31536000", async () => {
    const app = createTestApp();
    const res = await request(app).get("/test");
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
  });

  it("sets x-content-type-options header to nosniff", async () => {
    const app = createTestApp();
    const res = await request(app).get("/test");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets content-security-policy header containing default-src 'none'", async () => {
    const app = createTestApp();
    const res = await request(app).get("/test");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
  });
});
