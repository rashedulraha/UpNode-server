import { Worker } from "bullmq";
import { redisConnectionOptions, redisPublisher } from "../lib/redis";
import { PING_QUEUE_NAME } from "../queues/pingQueue";
import { addIncidentAlertJob } from "../queues/alertQueue";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { analyzeIncidentWithAI } from "../services/ai.service";
import tls from "tls";
import url from "url";
export const METRIC_CHANNEL = "METRIC_UPDATES";
/**
 * Extracts the SSL certificate expiration date for a given HTTPS URL
 */
export const getSSLCertExpiration = (targetUrl) => {
    return new Promise((resolve) => {
        try {
            const parsedUrl = url.parse(targetUrl);
            if (parsedUrl.protocol !== "https:") {
                return resolve(null);
            }
            const hostname = parsedUrl.hostname;
            if (!hostname) {
                return resolve(null);
            }
            const port = parsedUrl.port ? parseInt(parsedUrl.port) : 443;
            const socket = tls.connect({
                host: hostname,
                port,
                servername: hostname,
                rejectUnauthorized: false, // Extract cert details even if untrusted/expired
            }, () => {
                const cert = socket.getPeerCertificate();
                socket.destroy();
                if (cert && cert.valid_to) {
                    resolve(new Date(cert.valid_to));
                }
                else {
                    resolve(null);
                }
            });
            socket.on("error", () => {
                resolve(null);
            });
        }
        catch {
            resolve(null);
        }
    });
};
/**
 * Pings a single project URL, measures response time, records PingMetric in DB,
 * and creates a CRITICAL incident + alert job if 3 consecutive failures occur.
 */
/**
 * Returns true when a project is currently in maintenance mode (manual or scheduled).
 */
export const isInMaintenance = (project) => {
    if (project.maintenanceMode)
        return true;
    const now = new Date();
    if (project.maintenanceStart !== null &&
        project.maintenanceEnd !== null &&
        now >= project.maintenanceStart &&
        now <= project.maintenanceEnd) {
        return true;
    }
    return false;
};
export const pingSingleProject = async (project) => {
    const startTime = Date.now();
    let statusCode = null;
    let isUp = false;
    let responseTimeMs = 0;
    let sslExpirationDate = null;
    // 1. Capture SSL certificate expiration date for HTTPS endpoints
    if (project.url.startsWith("https://")) {
        sslExpirationDate = await getSSLCertExpiration(project.url);
    }
    // 2. Perform HTTP ping
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const response = await fetch(project.url, {
            method: "GET",
            signal: controller.signal,
            headers: {
                "User-Agent": "UpNode-UptimeMonitor/1.0",
            },
        });
        clearTimeout(timeoutId);
        responseTimeMs = Date.now() - startTime;
        statusCode = response.status;
        // Healthy is 2xx or 3xx status codes
        isUp = response.status >= 200 && response.status < 400;
    }
    catch (err) {
        responseTimeMs = Date.now() - startTime;
        statusCode = null;
        isUp = false;
    }
    // 3. Store performance metric in DB for historical graphs & update Project SSL expiration
    let pingMetricRecord = null;
    try {
        pingMetricRecord = await prisma.pingMetric.create({
            data: {
                projectId: project.id,
                url: project.url,
                statusCode: statusCode,
                responseTimeMs: responseTimeMs,
                isUp: isUp,
                sslExpirationDate: sslExpirationDate,
            },
        });
        // Update the project's SSL expiration date in the DB
        if (sslExpirationDate) {
            await prisma.project.update({
                where: { id: project.id },
                data: { sslExpiresAt: sslExpirationDate },
            });
        }
    }
    catch (dbErr) {
        logger.error(`[Ping Metric DB Error] Failed to save ping metric/update project for ${project.id}: ${dbErr.message}`);
    }
    // 4. Stream metric update via SSE (publish to Redis METRIC_CHANNEL)
    if (pingMetricRecord) {
        try {
            await redisPublisher.publish(METRIC_CHANNEL, JSON.stringify({
                type: "METRIC_CREATED",
                organizationId: project.organizationId,
                data: pingMetricRecord,
            }));
        }
        catch (pubErr) {
            logger.error(`[SSE Pub Error] Failed to stream metric over Redis: ${pubErr.message}`);
        }
    }
    let incidentCreated = false;
    // 5. Check maintenance mode before processing alert logic
    const inMaintenance = isInMaintenance(project);
    if (inMaintenance) {
        logger.info(`[Maintenance] Project "${project.name}" is in maintenance mode — ping recorded, alerts suppressed.` +
            (project.maintenanceMode
                ? " (Manual toggle)"
                : ` (Scheduled window: ${project.maintenanceStart?.toISOString()} → ${project.maintenanceEnd?.toISOString()})`));
        // Skip incident & alert logic — return early with metric already recorded
        return {
            projectId: project.id,
            projectName: project.name,
            url: project.url,
            isUp,
            statusCode,
            responseTimeMs,
            incidentCreated: false,
            sslExpirationDate,
        };
    }
    // 6. If the current ping failed, validate 3 consecutive failures before creating incident
    if (!isUp) {
        logger.warn(`[Uptime Alert] Ping failed for Project "${project.name}" (${project.url}) - Status: ${statusCode ?? "DOWN/TIMEOUT"}, Latency: ${responseTimeMs}ms`);
        // Fetch the last 2 ping metrics for this project
        let lastMetrics = [];
        try {
            lastMetrics = await prisma.pingMetric.findMany({
                where: { projectId: project.id },
                orderBy: { createdAt: "desc" },
                take: 3, // Current check is already inserted, so we fetch top 3 (current + last 2)
            });
        }
        catch (err) {
            logger.error(`[Ping Worker Error] Failed to fetch historical metrics for consecutive failure check: ${err.message}`);
        }
        // Check if the 3 most recent checks all failed
        const consecutiveFailuresCount = (lastMetrics || []).filter((m) => m && !m.isUp).length;
        const isConsecutiveFailuresMet = consecutiveFailuresCount >= 3;
        if (isConsecutiveFailuresMet) {
            // Check for existing open incident to avoid duplicate incidents
            const existingOpenIncident = await prisma.incident.findFirst({
                where: {
                    projectId: project.id,
                    status: { in: ["INVESTIGATING", "IDENTIFIED", "MONITORING"] },
                    title: { contains: "HTTP Ping Failed" },
                },
            });
            if (!existingOpenIncident) {
                const title = `HTTP Ping Failed: ${project.name} (Status: ${statusCode ?? "TIMEOUT/ERROR"})`;
                const description = `Automated uptime monitor detected 3 consecutive failed checks for ${project.url}. Last response status: ${statusCode ?? "No Response"}, Latency: ${responseTimeMs}ms.`;
                const aiAnalysis = await analyzeIncidentWithAI({
                    title,
                    description,
                    statusCode,
                    responseTimeMs,
                    url: project.url,
                });
                const incident = await prisma.incident.create({
                    data: {
                        title,
                        description,
                        status: "INVESTIGATING",
                        severity: "CRITICAL",
                        projectId: project.id,
                        aiRootCause: aiAnalysis.rootCause,
                        aiFixSuggestion: aiAnalysis.fixSuggestion,
                        timelineEvents: {
                            create: {
                                message: `Uptime check failed 3 consecutive times. Status: ${statusCode ?? "DOWN/TIMEOUT"}, Latency: ${responseTimeMs}ms`,
                                status: "INVESTIGATING",
                            },
                        },
                    },
                });
                incidentCreated = true;
                logger.info(`[Auto Incident Created] Created CRITICAL incident #${incident.id} for project ${project.name}`);
                // Trigger BullMQ Alert Queue for Slack/Email dispatches
                await addIncidentAlertJob({
                    incidentId: incident.id,
                    title: incident.title,
                    description: incident.description,
                    severity: incident.severity,
                    status: incident.status,
                    projectId: project.id,
                    organizationId: project.organizationId,
                    createdAt: incident.createdAt.toISOString(),
                });
            }
        }
    }
    else {
        logger.info(`[Uptime Check OK] Project "${project.name}" is UP (${statusCode}) - Latency: ${responseTimeMs}ms`);
    }
    return {
        projectId: project.id,
        projectName: project.name,
        url: project.url,
        isUp,
        statusCode,
        responseTimeMs,
        incidentCreated,
        sslExpirationDate,
    };
};
export const processPingJob = async (job) => {
    logger.info(`[Ping Worker] Processing scheduled 30-second project ping job #${job.id}`);
    // Fetch all projects that have a non-empty URL configured (+ maintenance fields)
    const projects = await prisma.project.findMany({
        where: {
            url: {
                not: null,
            },
        },
        select: {
            id: true,
            name: true,
            url: true,
            organizationId: true,
            maintenanceMode: true,
            maintenanceStart: true,
            maintenanceEnd: true,
        },
    });
    const validProjects = projects.filter((p) => Boolean(p.url && p.url.trim().length > 0));
    if (validProjects.length === 0) {
        logger.info(`[Ping Worker] No projects with active URLs found in database. Job complete.`);
        return { pingedCount: 0, results: [] };
    }
    const results = await Promise.all(validProjects.map((project) => pingSingleProject(project)));
    const upCount = results.filter((r) => r.isUp).length;
    const downCount = results.filter((r) => !r.isUp).length;
    logger.info(`[Ping Worker Summary] Pinged ${validProjects.length} projects: ${upCount} UP, ${downCount} DOWN.`);
    return {
        pingedCount: validProjects.length,
        upCount,
        downCount,
        results,
        timestamp: new Date().toISOString(),
    };
};
export const startPingWorker = () => {
    const worker = new Worker(PING_QUEUE_NAME, processPingJob, {
        connection: redisConnectionOptions,
        concurrency: 3,
    });
    worker.on("completed", (job, result) => {
        logger.info(`[Ping Worker] Job #${job.id} completed successfully:`, result);
    });
    worker.on("failed", (job, err) => {
        if (job) {
            logger.error(`[Ping Worker] Job #${job.id} failed: ${err.message}`);
        }
        else {
            logger.error(`[Ping Worker] Unknown ping job failed: ${err.message}`);
        }
    });
    logger.info(`[Ping Worker] Uptime ping worker started listening on queue: ${PING_QUEUE_NAME}`);
    return worker;
};
