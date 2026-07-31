import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { InviteMemberInput, UpdateMemberRoleInput } from "./organization.validation";
import crypto from "crypto";

export class OrganizationService {
  /**
   * Get all members belonging to an organization
   */
  async getOrganizationMembers(organizationId: string) {
    const members = await prisma.member.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    return members;
  }

  /**
   * Invite or add a new member to an organization by email and assign role
   */
  async inviteMember(organizationId: string, input: InviteMemberInput) {
    const { email, role } = input;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find existing user or create a new user profile record
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      const fallbackName = normalizedEmail.split("@")[0];
      user = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name: fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1),
          email: normalizedEmail,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    // 2. Check if user is already a member of this organization
    const existingMember = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: user.id,
        },
      },
    });

    if (existingMember) {
      const error: any = new Error(`User with email "${normalizedEmail}" is already a member of this organization.`);
      error.statusCode = 409;
      error.code = "MEMBER_ALREADY_EXISTS";
      throw error;
    }

    // 3. Create Member relationship in Prisma
    const newMember = await prisma.member.create({
      data: {
        organizationId,
        userId: user.id,
        role: role as Role,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
    });

    // 4. Create Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          action: `INVITE_MEMBER: Added ${normalizedEmail} as ${role}`,
          userId: user.id,
        },
      });
    } catch {
      // Ignore audit log failure if any constraint occurs
    }

    return newMember;
  }

  /**
   * Update an existing member's role
   */
  async updateMemberRole(organizationId: string, memberId: string, input: UpdateMemberRoleInput) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      const error: any = new Error("Member not found in this organization.");
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.member.update({
      where: { id: memberId },
      data: { role: input.role as Role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Remove a member from the organization
   */
  async removeMember(organizationId: string, memberId: string) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      const error: any = new Error("Member not found in this organization.");
      error.statusCode = 404;
      throw error;
    }

    await prisma.member.delete({
      where: { id: memberId },
    });

    return { success: true, message: "Member removed from organization successfully." };
  }
}

export const organizationService = new OrganizationService();
