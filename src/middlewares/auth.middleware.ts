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
    const organizationId = req.headers["x-organization-id"] as string;

    if (!organizationId) {
      res.status(400).json({ error: "Bad Request: x-organization-id header is required." });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: User not authenticated." });
      return;
    }

    // Verify user is a member of the organization
    const member = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: req.user.id,
        },
      },
    });

    if (!member) {
      res.status(403).json({ error: "Forbidden: You are not a member of this organization." });
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
