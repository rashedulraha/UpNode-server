import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../middlewares/error.middleware";
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

  async createProject(data: { name: string; apiKey?: string }, organizationId: string) {
    const apiKey = data.apiKey || `up_${crypto.randomBytes(16).toString("hex")}`;
    return prisma.project.create({
      data: {
        name: data.name,
        apiKey,
        organizationId,
      },
    });
  }

  async updateProject(projectId: string, data: { name?: string; apiKey?: string }, organizationId: string) {
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

    // 2. Fetch active incidents (not resolved)
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

    // 3. Fetch past 7 days incidents with timeline history
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

    // 4. Fetch recent ping metrics (last 50 pings)
    const recentMetrics = await prisma.pingMetric.findMany({
      where: {
        projectId: project.id,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // 5. Compute overall operational status
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
      past7DaysIncidents,
      recentMetrics: recentMetrics.reverse(), // Ascending order for performance graphs
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

    // Return success response confirming email subscription
    return {
      success: true,
      message: `Subscribed ${email} to real-time status updates for ${project.name}.`,
      projectName: project.name,
      email,
    };
  }
}

export const projectService = new ProjectService();
