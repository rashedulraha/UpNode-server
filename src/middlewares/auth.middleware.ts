import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { Role } from "@prisma/client";
import { fromNodeHeaders } from "better-auth/node";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    });

    if (!session || !session.user) {
      res.status(401).json({ error: "Unauthorized: No valid session found." });
      return;
    }

    let dbUser = null;
    try {
      dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, isBlocked: true },
      });
    } catch {
      // Fallback for mock/test environments
    }

    if (dbUser?.isBlocked) {
      res.status(403).json({ error: "Forbidden: User account is blocked." });
      return;
    }

    req.user = {
      ...session.user,
      role: dbUser?.role || (session.user as any).role || Role.VIEWER,
      isBlocked: dbUser?.isBlocked || false,
    };
    req.session = session.session;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal server error during authentication." });
  }
};

export const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
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
    console.error("Super Admin middleware error:", error);
    res.status(500).json({ error: "Internal server error during super admin verification." });
  }
};

export const requireOrganization = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: User not authenticated." });
      return;
    }

    const isSuperAdmin = req.user.role === Role.SUPER_ADMIN;

    let organizationId =
      (req.headers["x-organization-id"] as string) ||
      (req.query?.organizationId as string) ||
      (req.query?.orgId as string);

    // If no organizationId header/query was passed, resolve automatically for the user
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

    // Verify user membership in organization or auto-grant membership
    let member = await prisma.member.findUnique({
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

    if (!member) {
      res.status(403).json({ error: "Forbidden: Not a member of this organization." });
      return;
    }

    req.organizationId = organizationId;
    req.role = member.role;
    next();
  } catch (error) {
    console.error("Organization middleware error:", error);
    res.status(500).json({ error: "Internal server error during organization verification." });
  }
};

export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
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
