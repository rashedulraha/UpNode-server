import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();
const getRedisOptions = () => {
    const commonOptions = {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times) {
            // Exponential backoff capped at 10 seconds to avoid spamming the console
            return Math.min(times * 1000, 10000);
        },
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
export const redisConnectionOptions = getRedisOptions();
// Primary Redis instance
export const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, redisConnectionOptions)
    : new Redis(redisConnectionOptions);
// Publisher and Subscriber instances for SSE Pub/Sub
export const redisPublisher = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, redisConnectionOptions)
    : new Redis(redisConnectionOptions);
export const createRedisSubscriber = () => {
    return process.env.REDIS_URL
        ? new Redis(process.env.REDIS_URL, redisConnectionOptions)
        : new Redis(redisConnectionOptions);
};
redis.on("connect", () => console.log("Redis connected successfully"));
redis.on("error", (err) => console.error("Redis connection error:", err));
