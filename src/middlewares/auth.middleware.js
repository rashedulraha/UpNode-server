import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { Role } from "@prisma/client";
import { fromNodeHeaders } from "better-auth/node";
import { logger } from "../lib/logger";

// Helper functions for safe Redis caching with automatic error fallback
async function getCache(key) {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

async function setCache(key, data, ttlSeconds = 300) {
  try {
    await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
  } catch {
    // Silently ignore Redis write errors to prevent request failures
  }
}

export const invalidateUserSessionCache = async (userId, organizationId) => {
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

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.cookie || "";
    const sessionCacheKey = authHeader ? `auth:session:${authHeader}` : null;

    let session = null;

    if (sessionCacheKey) {
      session = await getCache(sessionCacheKey);
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

    let dbUser = await getCache(`user:cache:${session.user.id}`);

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
        message: "Forbidden: Please verify your email address to access the dashboard portal.",
      });
      return;
    }

    req.user = {
      ...session.user,
      role: dbUser?.role || session.user.role || Role.VIEWER,
      isBlocked: dbUser?.isBlocked || false,
    };
    req.session = session.session;
    next();
  } catch (error) {
    logger.error({ event: "AUTH_MIDDLEWARE_ERROR", error: error.message }, `[Auth Middleware] Error: ${error.message}`);
    res.status(500).json({ error: "Internal server error during authentication." });
  }
};

export const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: User not authenticated." });
      return;
    }

    if (req.user.isBlocked) {
      res.status(403).json({ error: "Forbidden: User account is blocked." });
      return;
    }

    if (req.user.role !== Role.SUPER_ADMIN) {
      res.status(403).json({ error: "Forbidden: Requires SUPER_ADMIN privileges." });
      return;
    }

    next();
  } catch (error) {
    logger.error({ event: "SUPER_ADMIN_MIDDLEWARE_ERROR", error: error.message }, `[Super Admin Middleware] Error: ${error.message}`);
    res.status(500).json({ error: "Internal server error during super admin verification." });
  }
};

export const requireOrganization = async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: User not authenticated." });
      return;
    }

    const isSuperAdmin = req.user.role === Role.SUPER_ADMIN;

    let organizationId =
      req.headers["x-organization-id"] ||
      req.query?.organizationId ||
      req.query?.orgId;

    // If no organizationId header/query was passed, resolve automatically for the user
    if (!organizationId) {
      const defaultOrgCacheKey = `user:default_org:${req.user.id}`;
      organizationId = (await getCache(defaultOrgCacheKey)) || "";

      if (!organizationId) {
        const userMember = await prisma.member.findFirst({
          where: { userId: req.user.id },
        });

        if (userMember) {
          organizationId = userMember.organizationId;
        } else {
          // Fallback to first existing organization in DB
          const defaultOrg = await prisma.organization.findFirst();
          if (defaultOrg) {
            organizationId = defaultOrg.id;
          }
        }

        if (organizationId) {
          await setCache(defaultOrgCacheKey, organizationId, 300);
        }
      }
    }

    if (!organizationId) {
      res.status(400).json({ error: "Bad Request: No organization context found." });
      return;
    }

    // SUPER_ADMIN (Root user) gets access to any Organization's data platform-wide
    if (isSuperAdmin) {
      req.organizationId = organizationId;
      req.role = Role.SUPER_ADMIN;
      next();
      return;
    }

    // Verify user membership in organization or auto-grant membership with Redis caching
    const memberCacheKey = `member:cache:${organizationId}:${req.user.id}`;
    let member = await getCache(memberCacheKey);

    if (!member) {
      member = await prisma.member.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: req.user.id,
          },
        },
      });

      if (!member) {
        // Auto-assign user into the organization (first to join gets ADMIN, else VIEWER)
        try {
          const memberCount = await prisma.member.count({
            where: { organizationId },
          });
          const assignedRole = memberCount === 0 ? Role.ADMIN : Role.VIEWER;

          member = await prisma.member.create({
            data: {
              organizationId,
              userId: req.user.id,
              role: assignedRole,
            },
          });
        } catch {
          member = await prisma.member.findFirst({
            where: { userId: req.user.id },
          });
        }
      }

      if (member) {
        await setCache(memberCacheKey, member, 300);
      }
    }

    if (!member) {
      res.status(403).json({ error: "Forbidden: Not a member of this organization." });
      return;
    }

    req.organizationId = organizationId;
    req.role = member.role;
    next();
  } catch (error) {
    logger.error({ event: "ORGANIZATION_MIDDLEWARE_ERROR", error: error.message }, `[Organization Middleware] Error: ${error.message}`);
    res.status(500).json({ error: "Internal server error during organization verification." });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.role && req.user?.role !== Role.SUPER_ADMIN) {
      res.status(403).json({ error: "Forbidden: Organization context required." });
      return;
    }

    // SUPER_ADMIN (Root user) passes all role requirements
    if (req.role === Role.SUPER_ADMIN || req.user?.role === Role.SUPER_ADMIN) {
      next();
      return;
    }

    if (!req.role || !roles.includes(req.role)) {
      res.status(403).json({ error: `Forbidden: Requires one of the following roles: ${roles.join(", ")}` });
      return;
    }

    next();
  };
};
