import Redis, { RedisOptions } from "ioredis";
import dotenv from "dotenv";

dotenv.config();
const getRedisOptions = (): RedisOptions => {
  const isTlsRequired = Boolean(process.env.REDIS_URL?.startsWith("rediss://"));


  const commonOptions: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      // Exponential backoff capped at 10 seconds to avoid spamming the console
      return Math.min(times * 1000, 10000);
    },
    ...(isTlsRequired ? { tls: { rejectUnauthorized: false } } : {}),
  };

  if (process.env.REDIS_URL) {
    return commonOptions;
  }

  return {
    ...commonOptions,
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  };
};

export const redisConnectionOptions: RedisOptions = getRedisOptions();

// Primary Redis instance
export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, redisConnectionOptions)
  : new Redis(redisConnectionOptions);

// Publisher and Subscriber instances for SSE Pub/Sub
export const redisPublisher = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, redisConnectionOptions)
  : new Redis(redisConnectionOptions);

export const createRedisSubscriber = (): Redis => {
  return process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, redisConnectionOptions)
    : new Redis(redisConnectionOptions);
};

import { logger } from "./logger";

redis.on("connect", () => logger.info("[Redis] Connected successfully"));
redis.on("error", (err) => logger.error({ event: "REDIS_CONNECTION_ERROR", error: err.message }, `[Redis] Connection error: ${err.message}`));
