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

import { createRateLimiter } from "../middleware/rate-limit.js";

function createTestApp(redisClient?: any, limitOverride?: number) {
  const app = express();
  app.use(express.json());
  app.use(createRateLimiter(redisClient, { limit: limitOverride ?? 3 }));
  app.get("/test", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  return app;
}

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 for requests under the threshold", async () => {
    const app = createTestApp(undefined, 3);
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("returns 429 after exceeding the limit", async () => {
    const app = createTestApp(undefined, 3);
    // Send limit+1 requests; the last one should get 429
    let lastRes: any;
    for (let i = 0; i < 4; i++) {
      lastRes = await request(app).get("/test").set("X-Forwarded-For", "1.2.3.4");
    }
    expect(lastRes.status).toBe(429);
    expect(lastRes.body).toEqual({ error: "Too many requests. Please slow down." });
  });

  it("response includes ratelimit header (draft-8 combined format)", async () => {
    const app = createTestApp(undefined, 3);
    const res = await request(app).get("/test");
    // draft-8 sends a combined `RateLimit` header (not separate ratelimit-limit)
    expect(res.headers).toHaveProperty("ratelimit");
  });

  it("GET /api/health is not rate-limited even after exceeding limit", async () => {
    const app = createTestApp(undefined, 3);
    // Exhaust the limit on /test
    for (let i = 0; i < 4; i++) {
      await request(app).get("/test").set("X-Forwarded-For", "2.3.4.5");
    }
    // /api/health should still return 200
    const healthRes = await request(app).get("/api/health").set("X-Forwarded-For", "2.3.4.5");
    expect(healthRes.status).toBe(200);
  });

  it("constructs RedisStore with sendCommand when redisClient is provided", () => {
    const mockRedisClient = { sendCommand: vi.fn() };
    createRateLimiter(mockRedisClient as any);
    expect(MockRedisStore).toHaveBeenCalledWith({
      sendCommand: expect.any(Function),
      prefix: "rl:",
    });
  });

  it("does not construct RedisStore when redisClient is undefined", () => {
    createRateLimiter(undefined);
    expect(MockRedisStore).not.toHaveBeenCalled();
  });
});
