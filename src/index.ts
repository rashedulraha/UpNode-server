import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { toNodeHandler } from "better-auth/node";

import { env } from "./config/env";
import { logger } from "./lib/logger";
import { auth } from "./lib/auth";
import { projectRoutes } from "./modules/projects/project.routes";
import { incidentRoutes } from "./modules/incidents/incident.routes";
import { streamRoutes } from "./modules/stream/stream.routes";
import { organizationRoutes } from "./modules/organization/organization.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { userRoutes } from "./modules/users/user.routes";
import { webhookRoutes } from "./modules/webhooks/webhook.routes";
import { errorHandler } from "./middlewares/error.middleware";
import { requestLogger } from "./middlewares/requestLogger.middleware";
import { ingestionRateLimiter, apiRateLimiter, authRateLimiter } from "./middlewares/rateLimit.middleware";
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
  })
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

// 5. Better Auth API Handler
app.all("/api/auth/*path", toNodeHandler(auth.handler));

// 6. Mount Feature Modules
app.use("/api/projects", projectRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/organization", organizationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/webhooks", webhookRoutes);
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

