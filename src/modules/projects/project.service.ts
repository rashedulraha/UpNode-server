import { prisma } from "../../lib/prisma";

export class ProjectService {
  async getProjectsByOrganization(organizationId: string) {
    return prisma.project.findMany({
      where: {
        organizationId,
      },
    });
  }

  async getProjectById(projectId: string, organizationId: string) {
    return prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
      },
    });
  }

  async createProject(data: { name: string; apiKey: string }, organizationId: string) {
    return prisma.project.create({
      data: {
        ...data,
        organizationId,
      },
    });
  }
}

export const projectService = new ProjectService();
