import { createClient, type RedisClientType } from "redis";
import { logger } from "../middleware/logger.js";

export async function createRedisClient(url: string): Promise<RedisClientType> {
  const client = createClient({
    url,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => Math.min(retries * 100, 2000),
    },
    disableOfflineQueue: true,
  });

  client.on("error", (err) => {
    logger.error({ err }, "[redis] client error");
  });

  await client.connect();
  logger.info("[redis] connected");
  return client as RedisClientType;
}
