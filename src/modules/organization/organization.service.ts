import { UserRole, UserRole as Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import {
	InviteMemberInput,
	UpdateMemberRoleInput,
} from "./organization.validation";
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
						emailVerified: true,
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
	 * Create a new organization and set the creator as ADMIN member
	 */
	async createOrganization(userId: string, name: string) {
		const slug = name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\s-]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.slice(0, 50);

		// Ensure slug is unique
		const existingOrg = await prisma.organization.findFirst({
			where: { slug },
		});
		const finalSlug = existingOrg
			? `${slug}-${crypto.randomBytes(3).toString("hex")}`
			: slug;

		const org = await prisma.organization.create({
			data: {
				name: name.trim(),
				slug: finalSlug,
			},
		});

		// Make the creator the ADMIN of this organization
		await prisma.member.create({
			data: {
				organizationId: org.id,
				userId,
				role: Role.ADMIN,
			},
		});

		return org;
	}

	/**
	 * Get all organizations accessible to a user.
	 */
	async getUserOrganizations(userId: string, userRole?: string) {
		const memberships = await prisma.member.findMany({
			where: { userId },
			include: {
				organization: {
					select: {
						id: true,
						name: true,
						slug: true,
						createdAt: true,
						_count: { select: { members: true, projects: true } },
					},
				},
			},
		});
		return memberships.map((m) => ({ ...m.organization, memberRole: m.role }));
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
					role: Role.ADMIN,
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
			const error: any = new Error(
				`User with email "${normalizedEmail}" is already a member of this organization.`,
			);
			error.statusCode = 409;
			error.code = "MEMBER_ALREADY_EXISTS";
			throw error;
		}

		// 3. Check if first member to join this Organization (if first member, role is ADMIN)
		const memberCount = await prisma.member.count({
			where: { organizationId },
		});
		const memberRole = memberCount === 0 ? Role.ADMIN : (role as Role);

		// Create Member relationship in Prisma
		const newMember = await prisma.member.create({
			data: {
				organizationId,
				userId: user.id,
				role: memberRole,
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
			// Ignore audit log failure
		}

		const inviteLink = `${process.env.CLIENT_URL || "http://localhost:3000"}/login?invited=true&email=${encodeURIComponent(normalizedEmail)}`;

		return {
			...newMember,
			inviteLink,
		};
	}

	/**
	 * Update an existing member's role
	 */
	async updateMemberRole(
		organizationId: string,
		memberId: string,
		input: UpdateMemberRoleInput,
	) {
		const member = await prisma.member.findFirst({
			where: { id: memberId, organizationId },
			include: { user: true },
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

		// Create Audit Log for Role Change
		try {
			await prisma.auditLog.create({
				data: {
					action: `UPDATE_ROLE: Changed role of ${member.user?.email || memberId} from ${member.role} to ${input.role}`,
					userId: member.userId,
				},
			});
		} catch {
			// Ignore audit log failure
		}

		return updated;
	}

	/**
	 * Remove a member from the organization
	 */
	async removeMember(organizationId: string, memberId: string) {
		const member = await prisma.member.findFirst({
			where: { id: memberId, organizationId },
			include: { user: true },
		});

		if (!member) {
			const error: any = new Error("Member not found in this organization.");
			error.statusCode = 404;
			throw error;
		}

		await prisma.member.delete({
			where: { id: memberId },
		});

		// Create Audit Log for Member Removal
		try {
			await prisma.auditLog.create({
				data: {
					action: `REMOVE_MEMBER: Removed ${member.user?.email || memberId} from organization`,
					userId: member.userId,
				},
			});
		} catch {
			// Ignore audit log failure
		}

		return {
			success: true,
			message: "Member removed from organization successfully.",
		};
	}

	/**
	 * Get organization and project integration alert settings
	 */
	async getIntegrations(organizationId: string) {
		const organization = await prisma.organization.findUnique({
			where: { id: organizationId },
			select: {
				id: true,
				name: true,
				slackWebhookUrl: true,
				alertEmail: true,
				projects: {
					select: {
						id: true,
						name: true,
						slug: true,
						slackWebhookUrl: true,
						alertEmail: true,
					},
				},
			},
		});

		if (!organization) {
			const error: any = new Error("Organization not found.");
			error.statusCode = 404;
			throw error;
		}

		return organization;
	}

	/**
	 * Update organization and/or project integration alert settings
	 */
	async updateIntegrations(
		organizationId: string,
		data: {
			slackWebhookUrl?: string | null;
			alertEmail?: string | null;
			projects?: Array<{
				id: string;
				slackWebhookUrl?: string | null;
				alertEmail?: string | null;
			}>;
		},
	) {
		// 1. Update Organization alert settings
		const updatedOrg = await prisma.organization.update({
			where: { id: organizationId },
			data: {
				slackWebhookUrl:
					data.slackWebhookUrl !== undefined ? data.slackWebhookUrl : undefined,
				alertEmail: data.alertEmail !== undefined ? data.alertEmail : undefined,
			},
		});

		// 2. Update individual project settings if provided
		if (data.projects && Array.isArray(data.projects)) {
			for (const proj of data.projects) {
				await prisma.project.updateMany({
					where: { id: proj.id, organizationId },
					data: {
						slackWebhookUrl:
							proj.slackWebhookUrl !== undefined
								? proj.slackWebhookUrl
								: undefined,
						alertEmail:
							proj.alertEmail !== undefined ? proj.alertEmail : undefined,
					},
				});
			}
		}

		return this.getIntegrations(organizationId);
	}
}

export const organizationService = new OrganizationService();
