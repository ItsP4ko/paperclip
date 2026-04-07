import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import cors from "cors";

function createCorsApp(allowedOrigins: string[]) {
  const app = express();
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    }),
  );
  app.get("/test", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

const ALLOWED_ORIGINS = ["https://app.vercel.app"];

describe("CORS middleware", () => {
  it("returns Access-Control-Allow-Origin and Access-Control-Allow-Credentials for allowed origin", async () => {
    const app = createCorsApp(ALLOWED_ORIGINS);
    const res = await request(app)
      .get("/test")
      .set("Origin", "https://app.vercel.app");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.vercel.app");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("handles OPTIONS preflight from allowed origin with correct headers", async () => {
    const app = createCorsApp(ALLOWED_ORIGINS);
    const res = await request(app)
      .options("/test")
      .set("Origin", "https://app.vercel.app")
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.vercel.app");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does NOT set Access-Control-Allow-Origin for unlisted origin", async () => {
    const app = createCorsApp(ALLOWED_ORIGINS);
    const res = await request(app)
      .get("/test")
      .set("Origin", "https://evil.example.com");

    // The CORS callback fires an error — the cors package returns a 500, but crucially
    // it does NOT echo back the Origin in Access-Control-Allow-Origin.
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("succeeds with no Origin header (curl, same-origin, mobile)", async () => {
    const app = createCorsApp(ALLOWED_ORIGINS);
    const res = await request(app).get("/test");

    expect(res.status).toBe(200);
    // No cross-origin headers required — request is allowed through
  });
});
