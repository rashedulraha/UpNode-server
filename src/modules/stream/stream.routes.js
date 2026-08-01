import { Router } from "express";
import { requireAuth, requireOrganization, requireSuperAdmin } from "../../middlewares/auth.middleware";
import { createRedisSubscriber } from "../../lib/redis";
import { INCIDENT_CHANNEL } from "../incidents/incident.service";
import { METRIC_CHANNEL } from "../../workers/pingWorker";
import { logger } from "../../lib/logger";
const router = Router();
// Set to track active SSE client responses for graceful shutdown draining
export const activeSSEConnections = new Set();
// Global Super Admin System Health Terminal Stream
router.get("/stream/admin", requireAuth, requireSuperAdmin, async (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    });
    if (typeof res.flush === "function") {
        res.flush();
    }
    activeSSEConnections.add(res);
    res.write(`event: connected\ndata: ${JSON.stringify({ type: "SYSTEM_CONNECTED", message: "Live Redis Telemetry Log Stream connected", timestamp: new Date().toISOString() })}\n\n`);
    const subscriber = createRedisSubscriber();
    let isClosed = false;
    const handleMessage = (channel, message) => {
        if (isClosed)
            return;
        try {
            const parsed = JSON.parse(message);
            res.write(`event: system_log\ndata: ${JSON.stringify({ channel, timestamp: new Date().toISOString(), payload: parsed })}\n\n`);
        }
        catch {
            res.write(`event: system_log\ndata: ${JSON.stringify({ channel, timestamp: new Date().toISOString(), rawMessage: message })}\n\n`);
        }
    };
    subscriber.on("message", handleMessage);
    try {
        await Promise.all([
            subscriber.subscribe(INCIDENT_CHANNEL),
            subscriber.subscribe(METRIC_CHANNEL),
        ]);
    }
    catch (err) {
        logger.error("[Admin SSE] Redis subscription failed:", err);
        activeSSEConnections.delete(res);
        res.end();
        return;
    }
    const heartbeatTimer = setInterval(() => {
        if (!isClosed) {
            res.write(`: ping\n\n`);
        }
    }, 10000);
    const cleanup = () => {
        if (isClosed)
            return;
        isClosed = true;
        activeSSEConnections.delete(res);
        clearInterval(heartbeatTimer);
        subscriber.removeListener("message", handleMessage);
        Promise.all([
            subscriber.unsubscribe(INCIDENT_CHANNEL),
            subscriber.unsubscribe(METRIC_CHANNEL)
        ])
            .then(() => subscriber.quit())
            .catch((err) => logger.error("[Admin SSE] Error disconnecting:", err));
    };
    req.on("close", cleanup);
    req.on("end", cleanup);
    res.on("error", cleanup);
});
// Stream endpoint requires user authentication and organization context
router.get("/stream", requireAuth, requireOrganization, async (req, res) => {
    const organizationId = req.organizationId;
    // 1. Set SSE Headers
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    });
    // Flush headers immediately if available
    if (typeof res.flush === "function") {
        res.flush();
    }
    // Register active connection
    activeSSEConnections.add(res);
    // 2. Send initial connection message
    res.write(`event: connected\ndata: ${JSON.stringify({ message: "SSE stream connected", organizationId })}\n\n`);
    // 3. Create dedicated Redis Subscriber for this SSE client connection
    const subscriber = createRedisSubscriber();
    let isClosed = false;
    const handleMessage = (channel, message) => {
        if (isClosed)
            return;
        if (channel === INCIDENT_CHANNEL) {
            try {
                const parsed = JSON.parse(message);
                // Only push events belonging to the client's organization
                if (parsed.organizationId === organizationId) {
                    res.write(`event: incident_update\ndata: ${JSON.stringify(parsed)}\n\n`);
                }
            }
            catch (err) {
                logger.error("[SSE] Error parsing Redis message:", err);
            }
        }
        else if (channel === METRIC_CHANNEL) {
            try {
                const parsed = JSON.parse(message);
                // Push metrics events belonging to client's organization
                if (parsed.organizationId === organizationId) {
                    res.write(`event: metric_update\ndata: ${JSON.stringify(parsed)}\n\n`);
                }
            }
            catch (err) {
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
    }
    catch (err) {
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
        if (isClosed)
            return;
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
