import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { instanceSettingsRoutes } from "../routes/instance-settings.js";

const mockInstanceSettingsService = vi.hoisted(() => ({
  getGeneral: vi.fn(),
  getExperimental: vi.fn(),
  updateGeneral: vi.fn(),
  updateExperimental: vi.fn(),
  listCompanyIds: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  instanceSettingsService: () => mockInstanceSettingsService,
  logActivity: mockLogActivity,
}));

const boardActor = {
  type: "board",
  userId: "local-board",
  source: "local_implicit",
  isInstanceAdmin: true,
};

function createMockRedisClient(cachedValue?: string) {
  return {
    isReady: true,
    get: vi.fn().mockResolvedValue(cachedValue ?? null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };
}

function createApp(actor: any, redisClient?: any) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", instanceSettingsRoutes({} as any, redisClient));
  app.use(errorHandler);
  return app;
}

describe("instance settings Redis cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstanceSettingsService.getGeneral.mockResolvedValue({
      censorUsernameInLogs: false,
      keyboardShortcuts: false,
      feedbackDataSharingPreference: "prompt",
    });
    mockInstanceSettingsService.updateGeneral.mockResolvedValue({
      id: "instance-settings-1",
      general: {
        censorUsernameInLogs: true,
        keyboardShortcuts: false,
        feedbackDataSharingPreference: "prompt",
      },
    });
    mockInstanceSettingsService.listCompanyIds.mockResolvedValue([]);
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("cache HIT — returns cached data without calling svc.getGeneral", async () => {
    const cachedSettings = {
      censorUsernameInLogs: true,
      keyboardShortcuts: true,
      feedbackDataSharingPreference: "allowed",
    };
    const redis = createMockRedisClient(JSON.stringify(cachedSettings));
    const app = createApp(boardActor, redis);

    const res = await request(app).get("/api/instance/settings/general");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedSettings);
    expect(mockInstanceSettingsService.getGeneral).not.toHaveBeenCalled();
  });

  it("cache MISS — calls svc.getGeneral and writes result to Redis with 60s TTL", async () => {
    const redis = createMockRedisClient(null);
    const app = createApp(boardActor, redis);

    const res = await request(app).get("/api/instance/settings/general");

    expect(res.status).toBe(200);
    expect(mockInstanceSettingsService.getGeneral).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith(
      "instance:settings:general",
      JSON.stringify({
        censorUsernameInLogs: false,
        keyboardShortcuts: false,
        feedbackDataSharingPreference: "prompt",
      }),
      { EX: 60 },
    );
  });

  it("cache INVALIDATION — PATCH calls del on the cache key after update", async () => {
    const redis = createMockRedisClient();
    const app = createApp(boardActor, redis);

    const res = await request(app)
      .patch("/api/instance/settings/general")
      .send({ censorUsernameInLogs: true });

    expect(res.status).toBe(200);
    expect(redis.del).toHaveBeenCalledWith("instance:settings:general");
  });

  it("Redis error — GET falls back to svc.getGeneral when redisClient.get throws", async () => {
    const redis = createMockRedisClient();
    redis.get = vi.fn().mockRejectedValue(new Error("Redis unavailable"));
    const app = createApp(boardActor, redis);

    const res = await request(app).get("/api/instance/settings/general");

    expect(res.status).toBe(200);
    expect(mockInstanceSettingsService.getGeneral).toHaveBeenCalledOnce();
  });

  it("no Redis client — GET calls svc.getGeneral directly", async () => {
    const app = createApp(boardActor, undefined);

    const res = await request(app).get("/api/instance/settings/general");

    expect(res.status).toBe(200);
    expect(mockInstanceSettingsService.getGeneral).toHaveBeenCalledOnce();
  });
});
