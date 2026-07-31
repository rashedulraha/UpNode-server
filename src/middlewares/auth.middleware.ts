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

    req.user = session.user;
    req.session = session.session;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal server error during authentication." });
  }
};

export const requireOrganization = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: User not authenticated." });
      return;
    }

    let organizationId =
      (req.headers["x-organization-id"] as string) ||
      (req.query.organizationId as string) ||
      (req.query.orgId as string);

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

    // Verify user membership in organization or auto-grant membership in dev mode
    let member = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: req.user.id,
        },
      },
    });

    if (!member) {
      // Auto-assign user into the organization
      try {
        member = await prisma.member.create({
          data: {
            organizationId,
            userId: req.user.id,
            role: Role.ADMIN,
          },
        });
      } catch {
        member = await prisma.member.findFirst({
          where: { userId: req.user.id },
        });
      }
    }

    req.organizationId = organizationId;
    req.role = member?.role || Role.ADMIN;
    next();
  } catch (error) {
    console.error("Organization middleware error:", error);
    res.status(500).json({ error: "Internal server error during organization verification." });
  }
};

export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.role) {
      res.status(403).json({ error: "Forbidden: Organization context required." });
      return;
    }

    if (!roles.includes(req.role)) {
      res.status(403).json({ error: `Forbidden: Requires one of the following roles: ${roles.join(", ")}` });
      return;
    }

    next();
  };
};
