import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  requireAuth,
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
        user: { id: "user_1", name: "Test" },
        session: { id: "sess_1" },
      };
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any);

      await requireAuth(req as Request, res as Response, next);

      expect(auth.api.getSession).toHaveBeenCalled();
      expect(req.user).toEqual(mockSession.user);
      expect(req.session).toEqual(mockSession.session);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
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

  describe("requireOrganization", () => {
    beforeEach(() => {
      req.user = { id: "user_1" } as any;
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

    it("should return 400 if x-organization-id header is missing", async () => {
      req.headers = {};

      await requireOrganization(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 if user is not a member", async () => {
      prismaMock.member.findUnique.mockResolvedValue(null);

      await requireOrganization(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
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
