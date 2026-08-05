import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../middlewares/error.middleware";
import { logger } from "../../lib/logger";
import { verifyUnsubscribeToken } from "../../lib/unsubscribe";
import crypto from "crypto";

export class ProjectService {
  async getProjectsByOrganization(organizationId: string) {
    return prisma.project.findMany({
      where: {
        organizationId,
      },
      include: {
        _count: {
          select: { incidents: true },
        },
      },
    });
  }

  async getProjectById(projectId: string, organizationId: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
      },
      include: {
        incidents: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!project) {
      throw new NotFoundError(`Project with ID '${projectId}' not found in your organization.`);
    }

    return project;
  }

  async createProject(data: { name: string; slug?: string; url?: string; apiKey?: string }, organizationId: string) {
    const apiKey = data.apiKey || `up_${crypto.randomBytes(16).toString("hex")}`;
    return prisma.project.create({
      data: {
        name: data.name,
        slug: data.slug,
        url: data.url,
        apiKey,
        organizationId,
      },
    });
  }

  async updateProject(projectId: string, data: { name?: string; slug?: string; url?: string; apiKey?: string }, organizationId: string) {
    await this.getProjectById(projectId, organizationId);

    return prisma.project.update({
      where: { id: projectId },
      data,
    });
  }

  async deleteProject(projectId: string, organizationId: string) {
    await this.getProjectById(projectId, organizationId);

    return prisma.project.delete({
      where: { id: projectId },
    });
  }

  /**
   * Rotate a project's API Key for security purposes
   */
  async rotateApiKey(projectId: string, organizationId: string, customApiKey?: string) {
    await this.getProjectById(projectId, organizationId);

    const newApiKey = customApiKey || `up_${crypto.randomBytes(16).toString("hex")}`;

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: { apiKey: newApiKey },
    });

    logger.info(`[API Key Rotation] Rotated API key for project '${projectId}' in organization '${organizationId}'`);

    return updatedProject;
  }


  /**
   * Public unauthenticated status page data provider
   */
  async getPublicProjectStatus(slugOrId: string) {
    // 1. Find project by slug or ID
    const project = await prisma.project.findFirst({
      where: {
        OR: [
          { slug: slugOrId },
          { id: slugOrId },
          { name: { equals: slugOrId, mode: "insensitive" } },
        ],
      },
    });

    if (!project) {
      throw new NotFoundError(`Public status page for '${slugOrId}' was not found.`);
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // 2. Fetch active/ongoing incidents (not resolved)
    const activeIncidents = await prisma.incident.findMany({
      where: {
        projectId: project.id,
        status: { in: ["INVESTIGATING", "IDENTIFIED", "MONITORING"] },
      },
      include: {
        timelineEvents: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Fetch resolved incidents history
    const resolvedIncidents = await prisma.incident.findMany({
      where: {
        projectId: project.id,
        status: "RESOLVED",
      },
      include: {
        timelineEvents: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // 4. Fetch past 7 days incidents with timeline history
    const past7DaysIncidents = await prisma.incident.findMany({
      where: {
        projectId: project.id,
        createdAt: { gte: sevenDaysAgo },
      },
      include: {
        timelineEvents: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 5. Fetch recent ping metrics (last 50 pings)
    const recentMetrics = await prisma.pingMetric.findMany({
      where: {
        projectId: project.id,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // 6. Fetch metrics for past 90 days to compute 90-day uptime bars
    const ninetyDaysMetrics = await prisma.pingMetric.findMany({
      where: {
        projectId: project.id,
        createdAt: { gte: ninetyDaysAgo },
      },
      select: {
        isUp: true,
        responseTimeMs: true,
        createdAt: true,
      },
    });

    const metricsByDay: Record<string, { total: number; up: number; totalLatency: number }> = {};
    for (const m of ninetyDaysMetrics) {
      const dayKey = m.createdAt.toISOString().split("T")[0];
      if (!metricsByDay[dayKey]) {
        metricsByDay[dayKey] = { total: 0, up: 0, totalLatency: 0 };
      }
      metricsByDay[dayKey].total += 1;
      if (m.isUp) metricsByDay[dayKey].up += 1;
      metricsByDay[dayKey].totalLatency += m.responseTimeMs;
    }

    const uptimeHistory90Days = [];
    const today = new Date();
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayData = metricsByDay[dateStr];

      if (dayData && dayData.total > 0) {
        const uptimePct = Number(((dayData.up / dayData.total) * 100).toFixed(1));
        const avgLat = Math.round(dayData.totalLatency / dayData.total);
        uptimeHistory90Days.push({
          date: dateStr,
          isUp: dayData.up === dayData.total,
          uptimePercentage: uptimePct,
          avgLatencyMs: avgLat,
          status: uptimePct >= 100 ? "OPERATIONAL" : uptimePct >= 80 ? "DEGRADED" : "OUTAGE",
        });
      } else {
        uptimeHistory90Days.push({
          date: dateStr,
          isUp: true,
          uptimePercentage: 100,
          avgLatencyMs: 0,
          status: "OPERATIONAL",
        });
      }
    }

    // 7. Compute overall operational status
    let systemStatus: "OPERATIONAL" | "DEGRADED_PERFORMANCE" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" = "OPERATIONAL";

    const hasCriticalActive = activeIncidents.some((i) => i.severity === "CRITICAL" || i.severity === "HIGH");
    const hasMinorActive = activeIncidents.some((i) => i.severity === "MEDIUM" || i.severity === "LOW");

    if (hasCriticalActive) {
      systemStatus = "MAJOR_OUTAGE";
    } else if (hasMinorActive) {
      systemStatus = "PARTIAL_OUTAGE";
    } else if (recentMetrics.length > 0 && recentMetrics.some((m) => !m.isUp)) {
      systemStatus = "DEGRADED_PERFORMANCE";
    }

    // Compute uptime percentage & avg latency
    const totalPings = recentMetrics.length;
    const upPings = recentMetrics.filter((m) => m.isUp).length;
    const uptimePercentage = totalPings > 0 ? Number(((upPings / totalPings) * 100).toFixed(2)) : 100;
    const avgLatencyMs =
      totalPings > 0
        ? Math.round(recentMetrics.reduce((acc, m) => acc + m.responseTimeMs, 0) / totalPings)
        : 0;

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug || project.id,
        url: project.url,
      },
      systemStatus,
      uptimePercentage,
      avgLatencyMs,
      activeIncidents,
      resolvedIncidents,
      past7DaysIncidents,
      uptimeHistory90Days,
      recentMetrics: recentMetrics.reverse(),
    };
  }

  async subscribeToStatusUpdates(slug: string, email: string) {
    if (!email || !email.includes("@")) {
      throw new Error("Please enter a valid email address.");
    }

    const project = await prisma.project.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
      },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // Save subscription email in database
    const subscriber = await prisma.statusSubscriber.upsert({
      where: {
        projectId_email: {
          projectId: project.id,
          email: email.toLowerCase().trim(),
        },
      },
      update: {},
      create: {
        projectId: project.id,
        email: email.toLowerCase().trim(),
      },
    });

    return {
      success: true,
      message: `Subscribed ${subscriber.email} to real-time status updates for ${project.name}.`,
      projectName: project.name,
      email: subscriber.email,
    };
  }

  async unsubscribeFromStatusUpdates(email: string, projectId: string, token: string) {
    if (!verifyUnsubscribeToken(email, projectId, token)) {
      throw new Error("Invalid or expired unsubscribe token.");
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Delete from StatusSubscriber table
    const deletedSubscribers = await prisma.statusSubscriber.deleteMany({
      where: {
        projectId,
        email: normalizedEmail,
      },
    });

    // 2. Remove from project.alertEmail if present
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (project && project.alertEmail) {
      const emailList = project.alertEmail
        .split(/[,;\s]+/)
        .filter((e) => e.trim().toLowerCase() !== normalizedEmail);
      await prisma.project.update({
        where: { id: projectId },
        data: { alertEmail: emailList.join(", ") },
      });
    }

    logger.info(
      { event: "EMAIL_UNSUBSCRIBED", email: normalizedEmail, projectId },
      `[Unsubscribe] ${normalizedEmail} unsubscribed from project ${projectId}`
    );

    return {
      success: true,
      message: `Successfully unsubscribed ${normalizedEmail} from incident alerts.`,
      count: deletedSubscribers.count,
    };
  }
}

export const projectService = new ProjectService();
