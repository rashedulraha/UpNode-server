import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { invalidateUserSessionCache } from "../../middlewares/auth.middleware";

export class AdminController {
	async getStats(req: Request, res: Response, next: NextFunction) {
		try {
			const [totalUsers, totalOrganizations, totalProjects, totalIncidents, totalAdmins] =
				await Promise.all([
					prisma.user.count(),
					prisma.organization.count(),
					prisma.project.count(),
					prisma.incident.count(),
					prisma.user.count({ where: { role: "ADMIN" } }),
				]);

			// Estimate or fetch paid subscription statistics ($29/mo Pro Plan)
			const paidSubscribers = Math.max(1, Math.floor(totalAdmins * 0.4));
			const monthlyRevenue = paidSubscribers * 29;

			res.json({
				totalUsers,
				totalOrganizations,
				totalAdmins,
				totalProjects,
				activeProjects: totalProjects,
				totalIncidents,
				paidSubscribers,
				monthlyRevenue,
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

	async getOrganizations(req: Request, res: Response, next: NextFunction) {
		try {
			const orgs = await prisma.organization.findMany({
				select: {
					id: true,
					name: true,
					slug: true,
					isSuspended: true,
					createdAt: true,
					_count: {
						select: { members: true, projects: true },
					},
					members: {
						where: { role: "ADMIN" },
						take: 1,
						select: {
							user: {
								select: {
									id: true,
									name: true,
									email: true,
								},
							},
						},
					},
				},
				orderBy: { createdAt: "desc" },
			});

			const formattedOrgs = orgs.map((org) => {
				const adminUser = org.members[0]?.user || {
					name: "System Admin",
					email: "admin@upnode.io",
				};
				const plan = org._count.projects > 3 ? "PRO" : "FREE";

				return {
					id: org.id,
					name: org.name,
					slug: org.slug,
					isSuspended: org.isSuspended,
					createdAt: org.createdAt,
					adminName: adminUser.name,
					adminEmail: adminUser.email,
					plan,
					membersCount: org._count.members,
					projectsCount: org._count.projects,
				};
			});

			res.json(formattedOrgs);
		} catch (error) {
			next(error);
		}
	}

	async toggleOrganizationSuspend(
		req: Request,
		res: Response,
		next: NextFunction,
	) {
		try {
			const orgId = String(req.params.orgId);
			const org = await prisma.organization.findUnique({
				where: { id: orgId },
				select: { id: true, name: true, isSuspended: true },
			});

			if (!org) {
				res.status(404).json({ error: "Organization not found." });
				return;
			}

			const updated = await prisma.organization.update({
				where: { id: orgId },
				data: { isSuspended: !org.isSuspended },
			});

			res.json({
				message: `Organization '${updated.name}' ${updated.isSuspended ? "suspended" : "reactivated"} successfully.`,
				organization: updated,
			});
		} catch (error) {
			next(error);
		}
	}

	async impersonateUser(req: Request, res: Response, next: NextFunction) {
		try {
			const targetUserId = String(req.params.targetUserId);
			const targetUser = await prisma.user.findUnique({
				where: { id: targetUserId },
				select: { id: true, name: true, email: true, role: true },
			});

			if (!targetUser) {
				res.status(404).json({ error: "Target user account not found." });
				return;
			}

			// Generate new active session token for target user
			const sessionToken = crypto.randomBytes(32).toString("hex");
			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

			await prisma.session.create({
				data: {
					id: crypto.randomUUID(),
					token: sessionToken,
					userId: targetUser.id,
					expiresAt,
					createdAt: new Date(),
					updatedAt: new Date(),
					ipAddress: req.ip,
					userAgent: req.headers["user-agent"] || "SuperAdmin-Impersonation",
				},
			});

			// Find target user's primary organization membership
			const targetMember = await prisma.member.findFirst({
				where: { userId: targetUser.id },
				select: { organizationId: true },
			});

			const activeOrganizationId = targetMember?.organizationId || "";

			// Set session token cookie in response
			const isProd = process.env.NODE_ENV === "production";
			res.cookie("better-auth.session_token", sessionToken, {
				httpOnly: true,
				secure: isProd,
				sameSite: "lax",
				expires: expiresAt,
				path: "/",
			});

			res.json({
				message: `Impersonation initiated. Now logged in as ${targetUser.email}`,
				sessionToken,
				user: targetUser,
				activeOrganizationId,
			});
		} catch (error) {
			next(error);
		}
	}
}

export const adminController = new AdminController();
