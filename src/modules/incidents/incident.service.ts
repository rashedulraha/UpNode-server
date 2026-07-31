import { prisma } from "../../lib/prisma";
import { redisPublisher } from "../../lib/redis";
import { addIncidentAlertJob } from "../../queues/alertQueue";
import { NotFoundError, OptimisticLockError, ForbiddenError } from "../../middlewares/error.middleware";
import { IncidentStatus, IncidentSeverity } from "@prisma/client";

import { analyzeIncidentWithAI } from "../../services/ai.service";

export interface CreateIncidentInput {
  title: string;
  description: string;
  projectId: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  aiRootCause?: string;
  aiFixSuggestion?: string;
}

export interface UpdateIncidentInput {
  title?: string;
  description?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  expectedVersion: number;
}

export interface IncidentFilterQuery {
  projectId?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  limit?: number;
  offset?: number;
}

export const INCIDENT_CHANNEL = "INCIDENT_UPDATES";

export class IncidentService {
  async createIncident(input: CreateIncidentInput, organizationId: string) {
    // 1. Verify Project belongs to Organization
    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        organizationId,
      },
    });

    if (!project) {
      throw new NotFoundError(`Project with ID '${input.projectId}' not found in your organization.`);
    }

    const initialStatus = input.status || IncidentStatus.INVESTIGATING;
    const initialSeverity = input.severity || IncidentSeverity.MEDIUM;

    // Run AI diagnostic analysis if not explicitly provided
    let aiRootCause = input.aiRootCause;
    let aiFixSuggestion = input.aiFixSuggestion;

    if (!aiRootCause || !aiFixSuggestion) {
      const aiAnalysis = await analyzeIncidentWithAI({
        title: input.title,
        description: input.description,
        url: project.url || undefined,
      });
      aiRootCause = aiRootCause || aiAnalysis.rootCause;
      aiFixSuggestion = aiFixSuggestion || aiAnalysis.fixSuggestion;
    }

    // 2. Perform DB operations inside Prisma Transaction
    const incident = await prisma.$transaction(async (tx) => {
      const newIncident = await tx.incident.create({
        data: {
          title: input.title,
          description: input.description,
          status: initialStatus,
          severity: initialSeverity,
          projectId: input.projectId,
          aiRootCause,
          aiFixSuggestion,
          version: 1, // Initial version stamp
        },
      });

      await tx.timelineEvent.create({
        data: {
          incidentId: newIncident.id,
          status: initialStatus,
          message: `Incident created: "${input.title}"`,
        },
      });

      return newIncident;
    });

    // 3. Add Background Alert Job to BullMQ
    await addIncidentAlertJob({
      incidentId: incident.id,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      projectId: incident.projectId,
      organizationId,
      createdAt: incident.createdAt.toISOString(),
    });

    // 4. Publish Real-time Event via Redis Pub/Sub for SSE
    try {
      await redisPublisher.publish(
        INCIDENT_CHANNEL,
        JSON.stringify({
          type: "INCIDENT_CREATED",
          organizationId,
          data: incident,
        })
      );
    } catch (err) {
      console.error("[SSE] Failed to publish incident creation event to Redis:", err);
    }

    return incident;
  }

  async updateIncident(incidentId: string, input: UpdateIncidentInput, organizationId: string) {
    // 1. Fetch current incident & verify multi-tenant access
    const existing = await prisma.incident.findFirst({
      where: {
        id: incidentId,
        project: { organizationId },
      },
    });

    if (!existing) {
      throw new NotFoundError(`Incident with ID '${incidentId}' not found in your organization.`);
    }

    // 2. Perform Optimistic Locking update inside transaction
    const updatedIncident = await prisma.$transaction(async (tx) => {
      // Attempt update only if version matches expectedVersion
      const updateResult = await tx.incident.updateMany({
        where: {
          id: incidentId,
          version: input.expectedVersion,
        },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.severity !== undefined && { severity: input.severity }),
          version: { increment: 1 }, // Bump version stamp
        },
      });

      // If no rows were updated, a concurrent modification occurred
      if (updateResult.count === 0) {
        throw new OptimisticLockError(
          `Conflict: Incident '${incidentId}' has been updated by another user or request. Please reload and try again.`
        );
      }

      // Fetch the updated record
      const result = await tx.incident.findUnique({
        where: { id: incidentId },
      });

      if (!result) {
        throw new NotFoundError("Incident not found after update.");
      }

      // Add a timeline event if status changed or updated
      if (input.status && input.status !== existing.status) {
        await tx.timelineEvent.create({
          data: {
            incidentId,
            status: input.status,
            message: `Status updated from ${existing.status} to ${input.status}`,
          },
        });
      } else {
        await tx.timelineEvent.create({
          data: {
            incidentId,
            status: result.status,
            message: `Incident details updated (version ${result.version})`,
          },
        });
      }

      return result;
    });

    // 3. Broadcast real-time update via Redis Pub/Sub
    try {
      await redisPublisher.publish(
        INCIDENT_CHANNEL,
        JSON.stringify({
          type: "INCIDENT_UPDATED",
          organizationId,
          data: updatedIncident,
        })
      );
    } catch (err) {
      console.error("[SSE] Failed to publish incident update event to Redis:", err);
    }

    return updatedIncident;
  }

  async getIncidents(organizationId: string, query: IncidentFilterQuery) {
    const { projectId, status, severity } = query;
    const limit = query.limit ? Number(query.limit) : 50;
    const offset = query.offset ? Number(query.offset) : 0;

    const validStatus =
      status && status !== ("ALL" as any) && Object.values(IncidentStatus).includes(status as IncidentStatus)
        ? (status as IncidentStatus)
        : undefined;

    const validSeverity =
      severity && severity !== ("ALL" as any) && Object.values(IncidentSeverity).includes(severity as IncidentSeverity)
        ? (severity as IncidentSeverity)
        : undefined;

    const validProjectId = projectId && projectId !== "ALL" ? String(projectId) : undefined;

    const whereCondition: any = {
      project: { organizationId },
    };

    if (validProjectId) whereCondition.projectId = validProjectId;
    if (validStatus) whereCondition.status = validStatus;
    if (validSeverity) whereCondition.severity = validSeverity;

    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where: whereCondition,
        take: Number.isNaN(limit) ? 50 : limit,
        skip: Number.isNaN(offset) ? 0 : offset,
        orderBy: { createdAt: "desc" },
        include: {
          project: {
            select: { id: true, name: true },
          },
          timelineEvents: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      prisma.incident.count({ where: whereCondition }),
    ]);

    return { items, total, limit, offset };
  }

  async getIncidentById(incidentId: string, organizationId: string) {
    const incident = await prisma.incident.findFirst({
      where: {
        id: incidentId,
        project: { organizationId },
      },
      include: {
        project: true,
        timelineEvents: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!incident) {
      throw new NotFoundError(`Incident with ID '${incidentId}' not found.`);
    }

    return incident;
  }
}

export const incidentService = new IncidentService();
