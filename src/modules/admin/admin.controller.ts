import { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { invalidateUserSessionCache } from "../../middlewares/auth.middleware";

export class AdminController {
	async getStats(req: Request, res: Response, next: NextFunction) {
		try {
			const [totalUsers, totalOrganizations, totalProjects, totalIncidents] =
				await Promise.all([
					prisma.user.count(),
					prisma.organization.count(),
					prisma.project.count(),
					prisma.incident.count(),
				]);

			res.json({
				totalUsers,
				totalOrganizations,
				totalProjects,
				totalIncidents,
				systemStatus: "HEALTHY",
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			next(error);
		}
	}

	async getUsers(req: Request, res: Response, next: NextFunction) {
		try {
			const users = await prisma.user.findMany({
				select: {
					id: true,
					name: true,
					email: true,
					role: true,
					isBlocked: true,
					emailVerified: true,
					createdAt: true,
					_count: {
						select: { members: true },
					},
				},
				orderBy: { createdAt: "desc" },
			});

			res.json(users);
		} catch (error) {
			next(error);
		}
	}

	async toggleUserBlock(req: Request, res: Response, next: NextFunction) {
		try {
			const userId = String(req.params.userId);
			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: { id: true, role: true, isBlocked: true, email: true },
			});

			if (!user) {
				res.status(404).json({ error: "User not found." });
				return;
			}

			if (user.role === "SUPER_ADMIN") {
				res.status(403).json({ error: "Cannot block Master Super Admin user." });
				return;
			}

			const updated = await prisma.user.update({
				where: { id: userId },
				data: { isBlocked: !user.isBlocked },
			});

			await invalidateUserSessionCache(userId);

			res.json({
				message: `User ${updated.email} ${updated.isBlocked ? "blocked" : "unblocked"} successfully.`,
				user: updated,
			});
		} catch (error) {
			next(error);
		}
	}
}

export const adminController = new AdminController();
