import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../setup";
import { organizationService } from "../../src/modules/organization/organization.service";
describe("OrganizationService Team Management", () => {
    const organizationId = "org-test-123";
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    it("should return organization members with user profiles", async () => {
        prismaMock.member.findMany.mockResolvedValue([
            {
                id: "mem-1",
                role: "ADMIN",
                organizationId,
                userId: "usr-1",
                user: {
                    id: "usr-1",
                    name: "Owner User",
                    email: "owner@example.com",
                    image: null,
                    createdAt: new Date(),
                },
            },
        ]);
        const members = await organizationService.getOrganizationMembers(organizationId);
        expect(prismaMock.member.findMany).toHaveBeenCalledWith({
            where: { organizationId },
            include: expect.any(Object),
            orderBy: { id: "asc" },
        });
        expect(members).toHaveLength(1);
        expect(members[0].user.email).toBe("owner@example.com");
    });
    it("should invite a new user by email and assign role", async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        prismaMock.user.create.mockResolvedValue({
            id: "usr-new-999",
            name: "Dev",
            email: "dev@example.com",
            emailVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        prismaMock.member.findUnique.mockResolvedValue(null);
        prismaMock.member.create.mockResolvedValue({
            id: "mem-new-123",
            role: "ENGINEER",
            organizationId,
            userId: "usr-new-999",
            user: {
                id: "usr-new-999",
                name: "Dev",
                email: "dev@example.com",
                image: null,
                createdAt: new Date(),
            },
        });
        const member = await organizationService.inviteMember(organizationId, {
            email: "dev@example.com",
            role: "ENGINEER",
        });
        expect(member.role).toBe("ENGINEER");
        expect(member.user.email).toBe("dev@example.com");
    });
    it("should throw conflict error if user is already a member", async () => {
        prismaMock.user.findUnique.mockResolvedValue({
            id: "usr-existing",
            email: "existing@example.com",
        });
        prismaMock.member.findUnique.mockResolvedValue({
            id: "mem-exist",
            organizationId,
            userId: "usr-existing",
        });
        await expect(organizationService.inviteMember(organizationId, {
            email: "existing@example.com",
            role: "VIEWER",
        })).rejects.toThrow("already a member");
    });
    it("should remove member from organization", async () => {
        prismaMock.member.findFirst.mockResolvedValue({
            id: "mem-delete",
            organizationId,
        });
        prismaMock.member.delete.mockResolvedValue({});
        const result = await organizationService.removeMember(organizationId, "mem-delete");
        expect(result.success).toBe(true);
    });
});
