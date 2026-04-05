import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { RedisClientType } from "redis";

export function createRateLimiter(redisClient?: RedisClientType, opts?: { limit?: number }) {
  const store = redisClient
    ? new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        prefix: "rl:",
      })
    : undefined;

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: opts?.limit ?? 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    store,
    skip: (req) => req.path === "/api/health" || req.headers.upgrade === "websocket",
    handler: (_req, res) => {
      res.status(429).json({ error: "Too many requests. Please slow down." });
    },
  });
}
