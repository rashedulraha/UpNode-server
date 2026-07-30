import Redis, { RedisOptions } from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const getRedisOptions = (): RedisOptions => {
  if (process.env.REDIS_URL) {
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
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

redis.on("connect", () => console.log("Redis connected successfully"));
redis.on("error", (err) => console.error("Redis connection error:", err));
