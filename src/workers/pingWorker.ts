import { Worker, Job } from "bullmq";
import { redisConnectionOptions } from "../lib/redis";
import { PING_QUEUE_NAME } from "../queues/pingQueue";
import { addIncidentAlertJob } from "../queues/alertQueue";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

export interface PingResult {
  projectId: string;
  projectName: string;
  url: string;
  isUp: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  incidentCreated: boolean;
}

/**
 * Pings a single project URL, measures response time, records PingMetric in DB,
 * and creates a CRITICAL incident + alert job if status is not 200.
 */
export const pingSingleProject = async (project: { id: string; name: string; url: string; organizationId: string }): Promise<PingResult> => {
  const startTime = Date.now();
  let statusCode: number | null = null;
  let isUp = false;
  let responseTimeMs = 0;

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
    isUp = response.status === 200;
  } catch (err: any) {
    responseTimeMs = Date.now() - startTime;
    statusCode = null;
    isUp = false;
  }

  // 1. Store performance metric in DB for historical graphs
  try {
    await prisma.pingMetric.create({
      data: {
        projectId: project.id,
        url: project.url,
        statusCode: statusCode,
        responseTimeMs: responseTimeMs,
        isUp: isUp,
      },
    });
  } catch (dbErr: any) {
    logger.error(`[Ping Metric DB Error] Failed to save ping metric for ${project.id}: ${dbErr.message}`);
  }

  let incidentCreated = false;

  // 2. If status is NOT 200, handle outage & trigger CRITICAL incident
  if (!isUp) {
    logger.warn(`[Uptime Alert] Ping failed for Project "${project.name}" (${project.url}) - Status: ${statusCode ?? "DOWN/TIMEOUT"}, Latency: ${responseTimeMs}ms`);

    // Check for existing open incident to avoid spamming duplicate incidents
    const existingOpenIncident = await prisma.incident.findFirst({
      where: {
        projectId: project.id,
        status: { in: ["INVESTIGATING", "IDENTIFIED", "MONITORING"] },
        title: { contains: "HTTP Ping Failed" },
      },
    });

    if (!existingOpenIncident) {
      const incident = await prisma.incident.create({
        data: {
          title: `HTTP Ping Failed: ${project.name} (Status: ${statusCode ?? "TIMEOUT/ERROR"})`,
          description: `Automated 5-minute uptime monitor detected an outage for ${project.url}. Response status: ${statusCode ?? "No Response"}, Latency: ${responseTimeMs}ms.`,
          status: "INVESTIGATING",
          severity: "CRITICAL",
          projectId: project.id,
          timelineEvents: {
            create: {
              message: `Automated uptime ping failed. Status: ${statusCode ?? "DOWN/TIMEOUT"}, Latency: ${responseTimeMs}ms`,
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
  } else {
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
  };
};

export const processPingJob = async (job: Job) => {
  logger.info(`[Ping Worker] Processing scheduled 5-minute project ping job #${job.id}`);

  // Fetch all projects that have a non-empty URL configured
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
    },
  });

  const validProjects = projects.filter(
    (p): p is { id: string; name: string; url: string; organizationId: string } => Boolean(p.url && p.url.trim().length > 0)
  );

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

  worker.on("completed", (job: Job, result) => {
    logger.info(`[Ping Worker] Job #${job.id} completed successfully:`, result);
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    if (job) {
      logger.error(`[Ping Worker] Job #${job.id} failed: ${err.message}`);
    } else {
      logger.error(`[Ping Worker] Unknown ping job failed: ${err.message}`);
    }
  });

  logger.info(`[Ping Worker] Uptime ping worker started listening on queue: ${PING_QUEUE_NAME}`);
  return worker;
};
