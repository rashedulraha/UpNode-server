import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";

import { env } from "./config/env";
import { logger } from "./lib/logger";
import { auth } from "./lib/auth";
import { prisma } from "./lib/prisma";
import { invalidateUserSessionCache } from "./middlewares/auth.middleware";
import { projectRoutes } from "./modules/projects/project.routes";
import { incidentRoutes } from "./modules/incidents/incident.routes";
import { streamRoutes } from "./modules/stream/stream.routes";
import { organizationRoutes } from "./modules/organization/organization.routes";
import { userRoutes } from "./modules/users/user.routes";
import { webhookRoutes } from "./modules/webhooks/webhook.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { errorHandler } from "./middlewares/error.middleware";
import { requestLogger } from "./middlewares/requestLogger.middleware";
import {
	ingestionRateLimiter,
	apiRateLimiter,
	authRateLimiter,
} from "./middlewares/rateLimit.middleware";
import { startAlertWorker } from "./workers/alertWorker";
import { startPingWorker } from "./workers/pingWorker";
import { setupCronPingJob } from "./queues/pingQueue";
import { setupGracefulShutdown } from "./lib/shutdown";

const app = express();

// Trust reverse proxy in production deployments (Nginx, Cloudflare, AWS ALB)
if (env.NODE_ENV === "production") {
	app.set("trust proxy", 1);
}

// 1. Production Security & Performance Middleware
app.use(helmet());
app.use(compression());
app.use(
	cors({
		origin: env.CLIENT_URL,
		credentials: true,
	}),
);

// 2. Request Parsing & Size Limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// 3. Centralized Request Logger
app.use(requestLogger);

// 4. Redis-Backed Rate Limiting
app.use("/api", apiRateLimiter);
app.use("/api/stream", ingestionRateLimiter);
app.use("/api/auth", authRateLimiter);

// 5. Skip Email Verification Endpoint (Dev / Localhost Mode)
app.post("/api/auth/skip-verification", async (req, res) => {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});

		if (!session || !session.user) {
			res.status(401).json({ error: "Unauthorized: No active session found." });
			return;
		}

		await prisma.user.update({
			where: { id: session.user.id },
			data: { emailVerified: true },
		});

		await invalidateUserSessionCache(session.user.id);

		logger.info(
			{ event: "EMAIL_VERIFICATION_SKIPPED", userId: session.user.id },
			`[Auth] User ${session.user.email} skipped email verification.`,
		);

		res.json({
			success: true,
			message: "Email verification skipped successfully.",
		});
	} catch (err: any) {
		logger.error(
			{ event: "SKIP_VERIFICATION_ERROR", error: err.message },
			`[Auth] Failed to skip email verification: ${err.message}`,
		);
		res.status(500).json({ error: "Failed to skip email verification." });
	}
});

// 6. Better Auth API Handler
app.all("/api/auth/*path", toNodeHandler(auth.handler));

// 6. Mount Feature Modules
app.use("/api/projects", projectRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/organization", organizationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/super-admin", adminRoutes);
app.use("/api", streamRoutes);

// Health check endpoint
app.get("/", (req, res) => {
	res.json({
		status: "online",
		service: "UpNode API",
		environment: env.NODE_ENV,
		timestamp: new Date().toISOString(),
	});
});

// 7. Centralized Error Handler (Must be registered after all routes)
app.use(errorHandler);

// 8. Start BullMQ Background Workers & 5-minute Cron Job Scheduler
const alertWorker = startAlertWorker();
const pingWorker = startPingWorker();
setupCronPingJob();

// 9. Start HTTP Server
const server = app.listen(env.PORT, () => {
	logger.info(`UpNode Server running on port ${env.PORT} [${env.NODE_ENV}]`);
});

// 10. Register Graceful Shutdown Handler (SIGTERM / SIGINT)
setupGracefulShutdown(server, [alertWorker, pingWorker]);
