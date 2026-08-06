import { Server } from "http";
import { Worker } from "bullmq";
import { prisma } from "./prisma";
import { redis, redisPublisher } from "./redis";
import {
	activeSSEConnections,
	closeSharedSubscriber,
} from "../modules/stream/stream.routes";
import { logger } from "./logger";

export const setupGracefulShutdown = (
	server: Server,
	workers?: Worker | Worker[],
): void => {
	let isShuttingDown = false;

	const shutdown = async (signal: string) => {
		if (isShuttingDown) return;
		isShuttingDown = true;

		logger.info(`Received ${signal}. Starting graceful shutdown process...`);

		// 10 second fallback emergency timeout
		const forceTimeout = setTimeout(() => {
			logger.error(
				"Graceful shutdown timeout exceeded (10s). Forcing process exit.",
			);
			process.exit(1);
		}, 10000);

		try {
			// 1. Stop HTTP Server from accepting new requests
			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) {
						logger.error("Error closing HTTP server:", err);
						return reject(err);
					}
					logger.info("HTTP server closed. In-flight requests completed.");
					resolve();
				});
			});

			// 2. Gracefully close active SSE stream connections
			if (activeSSEConnections.size > 0) {
				logger.info(
					`Closing ${activeSSEConnections.size} active SSE connections...`,
				);
				activeSSEConnections.forEach((res) => {
					try {
						res.write(
							`event: shutdown\ndata: ${JSON.stringify({ message: "Server shutting down" })}\n\n`,
						);
						res.end();
					} catch (err) {
						// Ignore socket end errors during shutdown
					}
				});
				activeSSEConnections.clear();
			}

			// 3. Close BullMQ background workers
			if (workers) {
				logger.info("Stopping BullMQ background workers...");
				const workerList = Array.isArray(workers) ? workers : [workers];
				await Promise.all(workerList.map((w) => w.close()));
				logger.info("BullMQ workers stopped successfully.");
			}

			// 4. Close Redis client connections
			logger.info("Closing Redis client connections...");
			await Promise.allSettled([
				redis.quit(),
				redisPublisher.quit(),
				closeSharedSubscriber(),
			]);
			logger.info("Redis connections closed.");

			// 5. Disconnect Prisma Database Client
			logger.info("Disconnecting Prisma database client...");
			await prisma.$disconnect();
			logger.info("Prisma database client disconnected.");

			clearTimeout(forceTimeout);
			logger.info(
				"Graceful shutdown completed successfully. Process exiting (code 0).",
			);
			process.exit(0);
		} catch (err: any) {
			logger.error("Error during graceful shutdown process:", err);
			clearTimeout(forceTimeout);
			process.exit(1);
		}
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
};
