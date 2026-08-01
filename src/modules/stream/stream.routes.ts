import { Router, Request, Response } from "express";
import { requireAuth, requireOrganization } from "../../middlewares/auth.middleware";
import { createRedisSubscriber } from "../../lib/redis";
import { INCIDENT_CHANNEL } from "../incidents/incident.service";
import { METRIC_CHANNEL } from "../../workers/pingWorker";
import { logger } from "../../lib/logger";

const router = Router();

// Set to track active SSE client responses for graceful shutdown draining
export const activeSSEConnections = new Set<Response>();

// Stream endpoint requires user authentication and organization context
router.get("/stream", requireAuth, requireOrganization, async (req: Request, res: Response): Promise<void> => {
  const organizationId = req.organizationId!;

  // 1. Set SSE Headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Flush headers immediately if available
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
  }

  // Register active connection
  activeSSEConnections.add(res);

  // 2. Send initial connection message
  res.write(`event: connected\ndata: ${JSON.stringify({ message: "SSE stream connected", organizationId })}\n\n`);

  // 3. Create dedicated Redis Subscriber for this SSE client connection
  const subscriber = createRedisSubscriber();

  let isClosed = false;

  const handleMessage = (channel: string, message: string) => {
    if (isClosed) return;
    if (channel === INCIDENT_CHANNEL) {
      try {
        const parsed = JSON.parse(message);
        // Only push events belonging to the client's organization
        if (parsed.organizationId === organizationId) {
          res.write(`event: incident_update\ndata: ${JSON.stringify(parsed)}\n\n`);
        }
      } catch (err) {
        logger.error("[SSE] Error parsing Redis message:", err);
      }
    } else if (channel === METRIC_CHANNEL) {
      try {
        const parsed = JSON.parse(message);
        // Push metrics events belonging to client's organization
        if (parsed.organizationId === organizationId) {
          res.write(`event: metric_update\ndata: ${JSON.stringify(parsed)}\n\n`);
        }
      } catch (err) {
        logger.error("[SSE] Error parsing Redis message for metric:", err);
      }
    }
  };

  subscriber.on("message", handleMessage);

  try {
    await Promise.all([
      subscriber.subscribe(INCIDENT_CHANNEL),
      subscriber.subscribe(METRIC_CHANNEL),
    ]);
    logger.info(`[SSE] Client connected for org: ${organizationId}`);
  } catch (err: any) {
    logger.error("[SSE] Redis subscription failed:", err);
    activeSSEConnections.delete(res);
    res.end();
    return;
  }

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
    subscriber.removeListener("message", handleMessage);

    Promise.all([
      subscriber.unsubscribe(INCIDENT_CHANNEL),
      subscriber.unsubscribe(METRIC_CHANNEL)
    ])
      .then(() => subscriber.quit())
      .catch((err) => logger.error("[SSE] Error disconnecting subscriber:", err));

    logger.info(`[SSE] Client disconnected for org: ${organizationId}`);
  };

  req.on("close", cleanup);
  req.on("end", cleanup);
  res.on("error", (err) => {
    logger.error("[SSE] Connection error:", err);
    cleanup();
  });
});

export { router as streamRoutes };
