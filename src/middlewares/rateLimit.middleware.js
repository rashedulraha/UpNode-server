import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../lib/redis";
import { env } from "../config/env";

export const createRateLimiter = (options) => {
  const windowMs = options?.windowMs || env.RATE_LIMIT_WINDOW_MS;
  const max = options?.max || env.RATE_LIMIT_MAX;
  const prefix = options?.prefix || "upnode:ratelimit:default:";

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user?.id || req.ip || "anonymous";
    },
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    }),
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: options?.message || "Too many requests. Please try again later.",
        error: {
          code: "TOO_MANY_REQUESTS",
        },
      });
    },
  });
};

export const apiRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  prefix: "upnode:ratelimit:api:",
  message: "Global API rate limit exceeded. Please slow down your requests.",
});

export const ingestionRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  prefix: "upnode:ratelimit:ingestion:",
  message: "Telemetry ingestion rate limit exceeded. Please throttle your client requests.",
});

export const projectMutationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: "upnode:ratelimit:project_mutation:",
  message: "Too many project creation or modification requests. Please try again later.",
});

export const incidentMutationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  prefix: "upnode:ratelimit:incident_mutation:",
  message: "Too many incident creation or update requests. Please try again later.",
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  prefix: "upnode:ratelimit:auth:",
  message: "Too many authentication attempts. Please try again later.",
});
