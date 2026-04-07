import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the redis module before importing redis-client
vi.mock("redis", () => {
  const mockClient = {
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    isReady: true,
  };
  return {
    createClient: vi.fn(() => mockClient),
  };
});

// Mock the logger to avoid file system side effects
vi.mock("../middleware/logger.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { createClient } from "redis";
import { createRedisClient } from "../services/redis-client.js";
import { loadConfig } from "../config.js";

describe("createRedisClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to return fresh mock client for each test
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      isReady: true,
    });
  });

  it("calls redis.createClient with the provided URL", async () => {
    await createRedisClient("redis://localhost:6379");
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "redis://localhost:6379",
      }),
    );
  });

  it("registers an error event listener before connecting", async () => {
    const mockClient = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      isReady: true,
    };
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    await createRedisClient("redis://localhost:6379");

    expect(mockClient.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("sets socket.reconnectStrategy that caps at 2000ms", async () => {
    await createRedisClient("redis://localhost:6379");

    const callArgs = (createClient as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const reconnectStrategy = callArgs.socket.reconnectStrategy;

    expect(reconnectStrategy).toBeTypeOf("function");
    expect(reconnectStrategy(1)).toBe(100);
    expect(reconnectStrategy(10)).toBe(1000);
    expect(reconnectStrategy(100)).toBe(2000); // capped at 2000
  });

  it("sets disableOfflineQueue: true", async () => {
    await createRedisClient("redis://localhost:6379");

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        disableOfflineQueue: true,
      }),
    );
  });
});

describe("Config redisUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  });

  it("includes redisUrl field populated from REDIS_URL env var", () => {
    process.env.REDIS_URL = "redis://test:6379";
    const config = loadConfig();
    expect(config.redisUrl).toBe("redis://test:6379");
  });

  it("sets redisUrl to undefined when REDIS_URL is empty/undefined", () => {
    delete process.env.REDIS_URL;
    const config = loadConfig();
    expect(config.redisUrl).toBeUndefined();
  });
});
