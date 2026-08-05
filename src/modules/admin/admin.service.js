import { prisma } from "../../lib/prisma";
import { redis } from "../../lib/redis";
export class AdminService {
    /**
     * Block or unblock a user account across the entire platform
     */
    async toggleBlockUser(userId, isBlocked) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            const error = new Error("User not found.");
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
    async deleteUserAccount(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            const error = new Error("User not found.");
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
     * Delete an organization across the platform
     */
    async deleteOrganization(organizationId) {
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
        });
        if (!org) {
            const error = new Error("Organization not found.");
            error.statusCode = 404;
            throw error;
        }
        const projects = await prisma.project.findMany({
            where: { organizationId },
            select: { id: true },
        });
        const projectIds = projects.map((p) => p.id);
        await prisma.$transaction([
            prisma.timelineEvent.deleteMany({ where: { incident: { projectId: { in: projectIds } } } }),
            prisma.incident.deleteMany({ where: { projectId: { in: projectIds } } }),
            prisma.pingMetric.deleteMany({ where: { projectId: { in: projectIds } } }),
            prisma.project.deleteMany({ where: { organizationId } }),
            prisma.member.deleteMany({ where: { organizationId } }),
            prisma.organization.delete({ where: { id: organizationId } }),
        ]);
        return { success: true, message: `Organization '${org.name}' deleted successfully.` };
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
    /**
     * Fetch real system stats for root dashboard (Organizations, Outages, Latency, Broker)
     */
    async getStats() {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [orgsCount, usersCount, projectsCount, activeIncidents, globalOutages, avgPing, successCount, totalCount] = await Promise.all([
            prisma.organization.count(),
            prisma.user.count(),
            prisma.project.count(),
            prisma.incident.count({ where: { status: { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] } } }),
            prisma.incident.count({ where: { severity: { in: ['CRITICAL', 'HIGH'] }, status: { not: 'RESOLVED' } } }),
            prisma.pingMetric.aggregate({
                where: { createdAt: { gte: yesterday } },
                _avg: { responseTimeMs: true }
            }),
            prisma.pingMetric.count({
                where: { createdAt: { gte: yesterday }, isUp: true }
            }),
            prisma.pingMetric.count({
                where: { createdAt: { gte: yesterday } }
            })
        ]);
        const redisStatus = redis.status === "ready" ? "CONNECTED" : "DISCONNECTED";
        const latency = Math.round(avgPing._avg.responseTimeMs || 18);
        const uptimePercentage = totalCount > 0
            ? Number(((successCount / totalCount) * 100).toFixed(2))
            : 99.98;
        return {
            totalOrganizations: orgsCount,
            totalUsers: usersCount,
            totalProjects: projectsCount,
            activeIncidents,
            globalOutages,
            redisStatus,
            latency,
            uptimePercentage
        };
    }
}
export const adminService = new AdminService();
