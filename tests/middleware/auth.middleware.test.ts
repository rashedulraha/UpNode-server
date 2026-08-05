import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  requireAuth,
  requireSuperAdmin,
  requireOrganization,
  requireRole,
} from "../../src/middlewares/auth.middleware";
import { auth } from "../../src/lib/auth";

import { Role } from "@prisma/client";
import { prismaMock } from "../setup";

// Mock Better Auth
vi.mock("../../src/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

describe("Auth Middleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe("requireAuth", () => {
    it("should call next if valid session exists", async () => {
      const mockSession = {
        user: { id: "user_1", name: "Test", emailVerified: true },
        session: { id: "sess_1" },
      };
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any);
      prismaMock.user.findUnique.mockResolvedValue({ id: "user_1", role: Role.VIEWER, isBlocked: false } as any);

      await requireAuth(req as Request, res as Response, next);

      expect(auth.api.getSession).toHaveBeenCalled();
      expect(req.user).toEqual({ ...mockSession.user, role: Role.VIEWER, isBlocked: false });
      expect(req.session).toEqual(mockSession.session);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 403 if user account is blocked", async () => {
      const mockSession = {
        user: { id: "user_1", name: "Test", emailVerified: true },
        session: { id: "sess_1" },
      };
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any);
      prismaMock.user.findUnique.mockResolvedValue({ id: "user_1", role: Role.VIEWER, isBlocked: true } as any);

      await requireAuth(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: User account is blocked." });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 if no session found", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      await requireAuth(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Unauthorized: No valid session found.",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("requireSuperAdmin", () => {
    it("should call next if user has SUPER_ADMIN role", async () => {
      req.user = { id: "admin_1", role: Role.SUPER_ADMIN, isBlocked: false } as any;

      await requireSuperAdmin(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 403 if user is not SUPER_ADMIN", async () => {
      req.user = { id: "user_1", role: Role.ADMIN, isBlocked: false } as any;

      await requireSuperAdmin(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: Requires SUPER_ADMIN privileges." });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 if super admin is blocked", async () => {
      req.user = { id: "admin_1", role: Role.SUPER_ADMIN, isBlocked: true } as any;

      await requireSuperAdmin(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: User account is blocked." });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("requireOrganization", () => {
    beforeEach(() => {
      req.user = { id: "user_1", role: Role.VIEWER } as any;
      req.headers = { "x-organization-id": "org_1" };
    });

    it("should call next if user is a member of the organization", async () => {
      prismaMock.member.findUnique.mockResolvedValue({
        id: "member_1",
        role: "ADMIN",
      } as any);

      await requireOrganization(req as Request, res as Response, next);

      expect(prismaMock.member.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_userId: { organizationId: "org_1", userId: "user_1" },
        },
      });
      expect(req.organizationId).toBe("org_1");
      expect(req.role).toBe("ADMIN");
      expect(next).toHaveBeenCalled();
    });

    it("should allow SUPER_ADMIN to access any organization data without membership record", async () => {
      req.user = { id: "root_1", role: Role.SUPER_ADMIN } as any;

      await requireOrganization(req as Request, res as Response, next);

      expect(req.organizationId).toBe("org_1");
      expect(req.role).toBe(Role.SUPER_ADMIN);
      expect(next).toHaveBeenCalled();
      expect(prismaMock.member.findUnique).not.toHaveBeenCalled();
    });

    it("should return 400 if organizationId is missing in request and DB", async () => {
      req.headers = {};
      prismaMock.member.findFirst.mockResolvedValue(null);
      prismaMock.organization.findFirst.mockResolvedValue(null);

      await requireOrganization(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("requireRole", () => {
    it("should call next if user has required role", () => {
      req.role = Role.ADMIN;
      const middleware = requireRole(Role.ADMIN, Role.ENGINEER);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it("should call next if user is SUPER_ADMIN even if role is not explicitly listed", () => {
      req.role = Role.SUPER_ADMIN;
      req.user = { id: "root_1", role: Role.SUPER_ADMIN } as any;
      const middleware = requireRole(Role.ADMIN, Role.ENGINEER);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it("should return 403 if user does not have required role", () => {
      req.role = Role.VIEWER;
      const middleware = requireRole(Role.ADMIN, Role.ENGINEER);

      middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 if organization context is missing", () => {
      req.role = undefined;
      const middleware = requireRole(Role.ADMIN);

      middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("context required"),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
