import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { UserRole, UserRole as Role } from "@prisma/client";
import { fromNodeHeaders } from "better-auth/node";
import { logger } from "../lib/logger";

// Helper functions for safe Redis caching with automatic error fallback
async function getCache<T>(key: string): Promise<T | null> {
	try {
		const data = await redis.get(key);
		return data ? (JSON.parse(data) as T) : null;
	} catch {
		return null;
	}
}

async function setCache(
	key: string,
	data: any,
	ttlSeconds: number = 300,
): Promise<void> {
	try {
		await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
	} catch {
		// Silently ignore Redis write errors to prevent request failures
	}
}

export const invalidateUserSessionCache = async (
	userId: string,
	organizationId?: string,
): Promise<void> => {
	try {
		await redis.del(`user:cache:${userId}`);
		await redis.del(`user:default_org:${userId}`);
		if (organizationId) {
			await redis.del(`member:cache:${organizationId}:${userId}`);
		}
	} catch {
		// Ignore cache clear errors
	}
};

export const requireAuth = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const authHeader = req.headers.authorization || req.headers.cookie || "";
		const sessionCacheKey = authHeader ? `auth:session:${authHeader}` : null;

		let session: any = null;

		if (sessionCacheKey) {
			session = await getCache<any>(sessionCacheKey);
		}

		if (!session) {
			session = await auth.api.getSession({
				headers: fromNodeHeaders(req.headers),
			});

			if (session && sessionCacheKey) {
				// Cache session for 60 seconds
				await setCache(sessionCacheKey, session, 60);
			}
		}

		if (!session || !session.user) {
			res.status(401).json({ error: "Unauthorized: No valid session found." });
			return;
		}

		let dbUser = await getCache<{ role: Role; isBlocked: boolean }>(
			`user:cache:${session.user.id}`,
		);

		if (!dbUser) {
			try {
				dbUser = await prisma.user.findUnique({
					where: { id: session.user.id },
					select: { role: true, isBlocked: true },
				});

				if (dbUser) {
					await setCache(`user:cache:${session.user.id}`, dbUser, 300);
				}
			} catch {
				// Fallback for mock/test environments
			}
		}

		if (dbUser?.isBlocked) {
			res.status(403).json({ error: "Forbidden: User account is blocked." });
			return;
		}

		if (session.user && !session.user.emailVerified) {
			res.status(403).json({
				error: "EMAIL_NOT_VERIFIED",
				message:
					"Forbidden: Please verify your email address to access the dashboard portal.",
			});
			return;
		}

		req.user = {
			...session.user,
			role: dbUser?.role || (session.user as any).role || Role.VIEWER,
			isBlocked: dbUser?.isBlocked || false,
		};
		req.session = session.session;
		next();
	} catch (error: any) {
		logger.error(
			{ event: "AUTH_MIDDLEWARE_ERROR", error: error.message },
			`[Auth Middleware] Error: ${error.message}`,
		);
		res
			.status(500)
			.json({ error: "Internal server error during authentication." });
	}
};

export const requireSuperAdmin = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	if (!req.user || req.user.role !== Role.SUPER_ADMIN) {
		res
			.status(403)
			.json({ error: "Forbidden: Requires Platform Super Admin role." });
		return;
	}
	next();
};

export const requireOrganization = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		if (!req.user) {
			res.status(401).json({ error: "Unauthorized: User not authenticated." });
			return;
		}

		let organizationId =
			(req.headers["x-organization-id"] as string) ||
			(req.query?.organizationId as string) ||
			(req.query?.orgId as string);

		// If user is SUPER_ADMIN, organizationId is optional/null as they own the entire platform
		if (req.user.role === Role.SUPER_ADMIN) {
			req.organizationId = organizationId || "";
			req.role = Role.SUPER_ADMIN;
			next();
			return;
		}

		// Verify if requested organizationId exists in DB
		if (organizationId) {
			const orgExists = await prisma.organization.findUnique({
				where: { id: organizationId },
				select: { id: true },
			});
			if (!orgExists) {
				organizationId = "";
			}
		}

		// Resolve organizationId if not explicitly provided
		if (!organizationId) {
			const defaultOrgCacheKey = `user:default_org:${req.user.id}`;
			organizationId = (await getCache<string>(defaultOrgCacheKey)) || "";

			if (!organizationId) {
				// Users fall back to their primary member organization
				const userMember = await prisma.member.findFirst({
					where: { userId: req.user.id },
				});

				if (userMember) {
					organizationId = userMember.organizationId;
				} else {
					// Auto-create default org for users without an organization context
					const baseName =
						req.user.name || req.user.email?.split("@")[0] || "Personal";
					const orgName = `${baseName}'s Workspace`;
					const slug = `workspace-${req.user.id.slice(0, 8)}`;

					try {
						const createdOrg = await prisma.organization.create({
							data: {
								name: orgName,
								slug,
								members: {
									create: {
										userId: req.user.id,
										role: Role.ADMIN,
									},
								},
							},
						});
						organizationId = createdOrg.id;
					} catch {
						// Retry with unique random slug suffix if slug collided
						const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
						const createdOrg = await prisma.organization.create({
							data: {
								name: orgName,
								slug: uniqueSlug,
								members: {
									create: {
										userId: req.user.id,
										role: Role.ADMIN,
									},
								},
							},
						});
						organizationId = createdOrg.id;
					}
				}

				if (organizationId) {
					await setCache(defaultOrgCacheKey, organizationId, 300);
				}
			}
		}

		if (!organizationId) {
			res
				.status(400)
				.json({ error: "Bad Request: No organization context found." });
			return;
		}

		// Check for x-role-preview header sent by ADMIN for role testing
		const rolePreview = req.headers["x-role-preview"] as string;

		// Users MUST be an explicit member of the organization
		const memberCacheKey = `member:cache:${organizationId}:${req.user.id}`;
		let member = await getCache<{ id: string; role: Role }>(memberCacheKey);

		if (!member) {
			member = await prisma.member.findUnique({
				where: {
					organizationId_userId: {
						organizationId,
						userId: req.user.id,
					},
				},
			});

			if (member) {
				await setCache(memberCacheKey, member, 300);
			}
		}

		if (!member) {
			res
				.status(403)
				.json({ error: "Forbidden: Not a member of this organization." });
			return;
		}

		req.organizationId = organizationId;
		req.role =
			rolePreview &&
			member.role === Role.ADMIN &&
			["ADMIN", "ENGINEER", "VIEWER"].includes(rolePreview)
				? (rolePreview as Role)
				: member.role;
		next();
	} catch (error: any) {
		logger.error(
			{ event: "ORGANIZATION_MIDDLEWARE_ERROR", error: error.message },
			`[Organization Middleware] Error: ${error.message}`,
		);
		res.status(500).json({
			error: "Internal server error during organization verification.",
		});
	}
};

export const requireRole = (...roles: Role[]) => {
	return (req: Request, res: Response, next: NextFunction) => {
		if (req.user?.role === Role.SUPER_ADMIN || req.role === Role.SUPER_ADMIN) {
			next();
			return;
		}

		if (!req.role) {
			res
				.status(403)
				.json({ error: "Forbidden: Organization context required." });
			return;
		}

		if (!roles.includes(req.role)) {
			res.status(403).json({
				error: `Forbidden: Requires one of the following roles: ${roles.join(", ")}`,
			});
			return;
		}

		next();
	};
};
