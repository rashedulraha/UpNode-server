import { prisma } from "../../lib/prisma";

export class AdminService {
  /**
   * Block or unblock a user account across the entire platform
   */
  async toggleBlockUser(userId: string, isBlocked: boolean) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      const error: any = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isBlocked },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isBlocked: true,
        updatedAt: true,
      },
    });

    // If blocking user, terminate all active sessions for this user
    if (isBlocked) {
      await prisma.session.deleteMany({
        where: { userId },
      });
    }

    return updatedUser;
  }

  /**
   * Delete a user account across the entire platform
   */
  async deleteUserAccount(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      const error: any = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    // Delete memberships, sessions, accounts, and user
    await prisma.$transaction([
      prisma.member.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.account.deleteMany({ where: { userId } }),
      prisma.auditLog.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    return { success: true, message: `User account '${user.email}' deleted successfully across platform.` };
  }

  /**
   * Get all organizations across the platform for Super Admin overview
   */
  async getAllOrganizations() {
    const organizations = await prisma.organization.findMany({
      include: {
        _count: {
          select: {
            members: true,
            projects: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return organizations;
  }

  /**
   * Get all users across the platform for Super Admin overview
   */
  async getAllUsers() {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isBlocked: true,
        createdAt: true,
        members: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return users;
  }
}

export const adminService = new AdminService();
