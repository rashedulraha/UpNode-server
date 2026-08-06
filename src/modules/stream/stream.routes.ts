import { Router, Request, Response } from "express";
import { EventEmitter } from "events";
import {
	requireAuth,
	requireOrganization,
	requireSuperAdmin,
} from "../../middlewares/auth.middleware";
import { createRedisSubscriber } from "../../lib/redis";
import { INCIDENT_CHANNEL } from "../incidents/incident.service";
import { METRIC_CHANNEL } from "../../workers/pingWorker";
import { logger } from "../../lib/logger";

const router = Router();

// Set to track active SSE client responses for graceful shutdown draining
export const activeSSEConnections = new Set<Response>();

// In-Memory Event Bus for Pub-Sub Multiplexing
const streamBus = new EventEmitter();
streamBus.setMaxListeners(0);

// Single Shared Redis Subscriber for all client connections
let sharedSubscriber: ReturnType<typeof createRedisSubscriber> | null = null;
let subscribePromise: Promise<void> | null = null;

function getSharedSubscriber(): Promise<void> {
	if (!sharedSubscriber) {
		sharedSubscriber = createRedisSubscriber();

		sharedSubscriber.on("message", (channel: string, message: string) => {
			streamBus.emit("message", channel, message);
		});

		sharedSubscriber.on("error", (err) => {
			logger.error("[Redis PubSub Multiplexer] Subscriber error:", err);
		});
	}

	if (!subscribePromise) {
		subscribePromise = Promise.all([
			sharedSubscriber.subscribe(INCIDENT_CHANNEL),
			sharedSubscriber.subscribe(METRIC_CHANNEL),
		])
			.then(() => {
				logger.info(
					"[Redis PubSub Multiplexer] Shared subscriber subscribed to telemetry channels.",
				);
			})
			.catch((err) => {
				subscribePromise = null;
				logger.error(
					"[Redis PubSub Multiplexer] Subscription setup failed:",
					err,
				);
				throw err;
			});
	}

	return subscribePromise;
}

export const closeSharedSubscriber = async (): Promise<void> => {
	if (sharedSubscriber) {
		try {
			await sharedSubscriber.quit();
			logger.info(
				"[Redis PubSub Multiplexer] Shared subscriber connection closed.",
			);
		} catch (err) {
			logger.error(
				"[Redis PubSub Multiplexer] Error closing shared subscriber:",
				err,
			);
		} finally {
			sharedSubscriber = null;
			subscribePromise = null;
		}
	}
};

// Global Super Admin System Health Terminal Stream
router.get(
	"/stream/admin",
	requireAuth,
	requireSuperAdmin,
	async (req: Request, res: Response): Promise<void> => {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		});

		if (typeof (res as any).flush === "function") {
			(res as any).flush();
		}

		activeSSEConnections.add(res);

		res.write(
			`event: connected\ndata: ${JSON.stringify({ type: "SYSTEM_CONNECTED", message: "Live Redis Telemetry Log Stream connected", timestamp: new Date().toISOString() })}\n\n`,
		);

		try {
			await getSharedSubscriber();
		} catch (err: any) {
			logger.error("[Admin SSE] Redis subscription setup failed:", err);
			activeSSEConnections.delete(res);
			res.end();
			return;
		}

		let isClosed = false;

		const handleMessage = (channel: string, message: string) => {
			if (isClosed) return;
			try {
				const parsed = JSON.parse(message);
				res.write(
					`event: system_log\ndata: ${JSON.stringify({ channel, timestamp: new Date().toISOString(), payload: parsed })}\n\n`,
				);
			} catch {
				res.write(
					`event: system_log\ndata: ${JSON.stringify({ channel, timestamp: new Date().toISOString(), rawMessage: message })}\n\n`,
				);
			}
		};

		streamBus.on("message", handleMessage);

		const heartbeatTimer = setInterval(() => {
			if (!isClosed) {
				res.write(`: ping\n\n`);
			}
		}, 10000);

		const cleanup = () => {
			if (isClosed) return;
			isClosed = true;

			activeSSEConnections.delete(res);
			clearInterval(heartbeatTimer);
			streamBus.removeListener("message", handleMessage);
		};

		req.on("close", cleanup);
		req.on("end", cleanup);
		res.on("error", cleanup);
	},
);

// Stream endpoint requires user authentication and organization context
router.get(
	"/stream",
	requireAuth,
	requireOrganization,
	async (req: Request, res: Response): Promise<void> => {
		const organizationId = req.organizationId!;

		// 1. Set SSE Headers
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		});

		// Flush headers immediately if available
		if (typeof (res as any).flush === "function") {
			(res as any).flush();
		}

		// Register active connection
		activeSSEConnections.add(res);

		// 2. Send initial connection message
		res.write(
			`event: connected\ndata: ${JSON.stringify({ message: "SSE stream connected", organizationId })}\n\n`,
		);

		try {
			await getSharedSubscriber();
			logger.info(`[SSE] Client connected for org: ${organizationId}`);
		} catch (err: any) {
			logger.error("[SSE] Redis subscription setup failed:", err);
			activeSSEConnections.delete(res);
			res.end();
			return;
		}

		let isClosed = false;

		const handleMessage = (channel: string, message: string) => {
			if (isClosed) return;
			if (channel === INCIDENT_CHANNEL) {
				try {
					const parsed = JSON.parse(message);
					// Only push events belonging to the client's organization
					if (parsed.organizationId === organizationId) {
						res.write(
							`event: incident_update\ndata: ${JSON.stringify(parsed)}\n\n`,
						);
					}
				} catch (err) {
					logger.error("[SSE] Error parsing Redis message:", err);
				}
			} else if (channel === METRIC_CHANNEL) {
				try {
					const parsed = JSON.parse(message);
					// Push metrics events belonging to client's organization
					if (parsed.organizationId === organizationId) {
						res.write(
							`event: metric_update\ndata: ${JSON.stringify(parsed)}\n\n`,
						);
					}
				} catch (err) {
					logger.error("[SSE] Error parsing Redis message for metric:", err);
				}
			}
		};

		streamBus.on("message", handleMessage);

		// 4. Periodic heartbeat ping (every 15 seconds)
		const heartbeatTimer = setInterval(() => {
			if (!isClosed) {
				res.write(`: ping\n\n`);
			}
		}, 15000);

		// 5. Cleanup on disconnect
		const cleanup = () => {
			if (isClosed) return;
			isClosed = true;

			activeSSEConnections.delete(res);
			clearInterval(heartbeatTimer);
			streamBus.removeListener("message", handleMessage);

			logger.info(`[SSE] Client disconnected for org: ${organizationId}`);
		};

		req.on("close", cleanup);
		req.on("end", cleanup);
		res.on("error", (err) => {
			logger.error("[SSE] Connection error:", err);
			cleanup();
		});
	},
);

export { router as streamRoutes };
