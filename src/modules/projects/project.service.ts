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
}

export const projectService = new ProjectService();
