import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../lib/redis";
import { env } from "../config/env";

// Redis Store Sliding Window Rate Limiter Factory
export const createRateLimiter = (options?: {
	windowMs?: number;
	max?: number;
	message?: string;
	prefix?: string;
}) => {
	const windowMs = options?.windowMs || env.RATE_LIMIT_WINDOW_MS;
	const max = options?.max || env.RATE_LIMIT_MAX;
	const prefix = options?.prefix || "upnode:ratelimit:default:";

	return rateLimit({
		windowMs,
		max,
		standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
		legacyHeaders: false, // Disable `X-RateLimit-*` headers
		keyGenerator: (req) => {
			// Redis key based on authenticated user ID or request IP
			return (req as any).user?.id || req.ip || "anonymous";
		},
		store: new RedisStore({
			// @ts-expect-error - ioredis sendCommand compatibility
			sendCommand: (...args: string[]) => redis.call(...args),
			prefix,
		}),
		handler: (req, res) => {
			res.status(429).json({
				success: false,
				message:
					options?.message || "Too many requests. Please try again later.",
				error: {
					code: "TOO_MANY_REQUESTS",
				},
			});
		},
	});
};

// Global API Rate Limiter (100 req/min)
export const apiRateLimiter = createRateLimiter({
	windowMs: env.RATE_LIMIT_WINDOW_MS,
	max: env.RATE_LIMIT_MAX,
	prefix: "upnode:ratelimit:api:",
	message: "Global API rate limit exceeded. Please slow down your requests.",
});

// Telemetry & SSE Ingestion Rate Limiter
export const ingestionRateLimiter = createRateLimiter({
	windowMs: env.RATE_LIMIT_WINDOW_MS,
	max: env.RATE_LIMIT_MAX,
	prefix: "upnode:ratelimit:ingestion:",
	message:
		"Telemetry ingestion rate limit exceeded. Please throttle your client requests.",
});

// Project Creation & Modification Rate Limiter (10 req / 15 mins)
export const projectMutationRateLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	max: 10,
	prefix: "upnode:ratelimit:project_mutation:",
	message:
		"Too many project creation or modification requests. Please try again later.",
});

// Incident Creation & Update Rate Limiter (20 req / 1 min)
export const incidentMutationRateLimiter = createRateLimiter({
	windowMs: 60 * 1000,
	max: 20,
	prefix: "upnode:ratelimit:incident_mutation:",
	message:
		"Too many incident creation or update requests. Please try again later.",
});

// Auth Route Rate Limiter (Allows frequent get-session polling while protecting sign-in/sign-up)
export const authRateLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	max: env.NODE_ENV === "development" ? 1000 : 200,
	prefix: "upnode:ratelimit:auth:",
	message: "Too many authentication attempts. Please try again later.",
});
