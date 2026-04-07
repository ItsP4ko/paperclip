import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockRedisStoreInstance = {
  increment: vi.fn().mockResolvedValue({ totalHits: 1, resetTime: new Date() }),
  decrement: vi.fn().mockResolvedValue(undefined),
  resetKey: vi.fn().mockResolvedValue(undefined),
};
const MockRedisStore = vi.hoisted(() => vi.fn(() => mockRedisStoreInstance));
vi.mock("rate-limit-redis", () => ({
  RedisStore: MockRedisStore,
}));

import { createLoginRateLimiter } from "../middleware/login-rate-limit.js";

function createTestApp(redisClient?: any) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.all("/api/auth/sign-in/email", createLoginRateLimiter(redisClient));
  app.post("/api/auth/sign-in/email", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/api/auth/get-session", (_req, res) => {
    res.status(200).json({ session: {} });
  });
  return app;
}

describe("createLoginRateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 for requests under the threshold", async () => {
    const app = createTestApp();
    const res = await request(app).post("/api/auth/sign-in/email");
    expect(res.status).toBe(200);
  });

  it("returns 429 after exceeding 10 attempts from the same IP", async () => {
    const app = createTestApp();
    let lastRes: any;
    for (let i = 0; i < 11; i++) {
      lastRes = await request(app)
        .post("/api/auth/sign-in/email")
        .set("X-Forwarded-For", "10.0.0.1");
    }
    expect(lastRes.status).toBe(429);
    expect(lastRes.body).toEqual({
      error: "Too many login attempts. Please wait 15 minutes before trying again.",
    });
  });

  it("uses Redis store when redisClient is provided", () => {
    const mockRedisClient = { sendCommand: vi.fn() };
    createLoginRateLimiter(mockRedisClient as any);
    expect(MockRedisStore).toHaveBeenCalledWith({
      sendCommand: expect.any(Function),
      prefix: "rl:login:",
    });
  });

  it("does not construct RedisStore when redisClient is undefined", () => {
    createLoginRateLimiter();
    expect(MockRedisStore).not.toHaveBeenCalled();
  });

  it("does not affect other auth routes", async () => {
    const app = createTestApp();
    // Exhaust the limit on sign-in
    for (let i = 0; i < 11; i++) {
      await request(app)
        .post("/api/auth/sign-in/email")
        .set("X-Forwarded-For", "10.0.0.2");
    }
    // /api/auth/get-session should still return 200
    const sessionRes = await request(app)
      .get("/api/auth/get-session")
      .set("X-Forwarded-For", "10.0.0.2");
    expect(sessionRes.status).toBe(200);
  });
});
