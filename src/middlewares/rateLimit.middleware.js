import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../lib/redis";
import { env } from "../config/env";
// Redis Store Sliding Window Rate Limiter
export const createRateLimiter = (options) => {
    const windowMs = options?.windowMs || env.RATE_LIMIT_WINDOW_MS;
    const max = options?.max || env.RATE_LIMIT_MAX;
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
        legacyHeaders: false, // Disable `X-RateLimit-*` headers
        store: new RedisStore({
            // @ts-expect-error - ioredis sendCommand compatibility
            sendCommand: (...args) => redis.call(...args),
            prefix: "upnode:ratelimit:",
        }),
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                message: options?.message || "Too many requests from this IP. Please try again later.",
                error: {
                    code: "TOO_MANY_REQUESTS",
                },
            });
        },
    });
};
// Rate Limiter for Ingestion & Telemetry routes
export const ingestionRateLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    message: "Telemetry ingestion rate limit exceeded. Please throttle your client requests.",
});
