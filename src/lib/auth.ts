import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { env } from "../config/env";
import { UserRole, UserRole as Role } from "@prisma/client";
import { logger } from "./logger";

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	trustedOrigins: [env.CLIENT_URL, "http://localhost:3000"],
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID || "",
			clientSecret: env.GOOGLE_CLIENT_SECRET || "",
			enabled: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
		},
		github: {
			clientId: env.GITHUB_CLIENT_ID || "",
			clientSecret: env.GITHUB_CLIENT_SECRET || "",
			enabled: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
		},
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google", "github"],
			requireLocalEmailVerified: false,
		},
	},

	user: {
		additionalFields: {
			role: {
				type: "string",
				defaultValue: UserRole.ADMIN,
			},
			isBlocked: {
				type: "boolean",
				defaultValue: false,
			},
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					const isMasterAccount =
						user.email.toLowerCase().trim() === "rashedulraha.bd@gmail.com";
					const assignedRole = isMasterAccount
						? UserRole.SUPER_ADMIN
						: UserRole.ADMIN;

					await prisma.user.update({
						where: { id: user.id },
						data: { role: assignedRole },
					});

					const orgName = `${user.name || user.email.split("@")[0]}'s Org`;
					const baseSlug = (user.name || user.email.split("@")[0])
						.toLowerCase()
						.replace(/[^a-z0-9]/g, "-")
						.replace(/-+/g, "-")
						.replace(/^-|-$/g, "");
					const slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;

					const organization = await prisma.organization.create({
						data: {
							name: orgName,
							slug,
							alertEmail: user.email,
							members: {
								create: {
									userId: user.id,
									role: Role.ADMIN,
								},
							},
						},
					});

					logger.info(
						{
							event: "ORGANIZATION_AUTO_CREATED",
							userId: user.id,
							orgId: organization.id,
						},
						`[Auth] Created organization '${orgName}' (${organization.id}) with ADMIN role for new user ${user.email}`,
					);
				},
			},
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			const email = user.email;

			let clientVerificationUrl = url;
			try {
				const parsedUrl = new URL(url);
				const token = parsedUrl.searchParams.get("token");
				if (token) {
					clientVerificationUrl = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;
				}
			} catch {
				// Fallback to original url
			}

			const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin: 0 0 12px 0; font-size: 20px; font-weight: 700; text-transform: uppercase; font-family: monospace;">[UPNODE] Verify Your Email Address</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">Hi ${user.name || "there"},</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">Thank you for registering on UpNode. Click the button below to verify your email address and activate your telemetry portal access:</p>
          <p style="margin-bottom: 24px;">
            <a href="${clientVerificationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 0px; font-weight: 600; font-family: monospace; font-size: 12px; border: 1px solid #000000; text-transform: uppercase;">[VERIFY_EMAIL]</a>
          </p>
          <p style="color: #64748b; font-size: 12px; line-height: 1.5; border-top: 1px solid #edf2f7; padding-top: 16px; margin-top: 24px; font-family: monospace;">
            If you did not create an account on UpNode, you can safely ignore this email.
          </p>
        </div>
      `;

			// Always print link clearly in terminal console for easy localhost testing
			console.log(
				`\n=================================================================`,
			);
			console.log(`✉️  [UPNODE VERIFICATION LINK FOR: ${email}]`);
			console.log(`👉 ${clientVerificationUrl}`);
			console.log(
				`=================================================================\n`,
			);

			if (env.RESEND_API_KEY) {
				try {
					const fromEmail = env.EMAIL_FROM || "onboarding@resend.dev";
					const response = await fetch("https://api.resend.com/emails", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${env.RESEND_API_KEY}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							from: fromEmail,
							to: email,
							subject: "[UpNode] Verify Your Email Address",
							html: htmlContent,
						}),
					});

					if (!response.ok) {
						const errorText = await response.text();
						if (
							errorText.includes("only send to your own email") ||
							errorText.includes("domain") ||
							response.status === 403
						) {
							logger.warn(
								`[Better Auth Resend Fallback] Resend default domain restriction detected. Retrying dispatch to account owner rashedulraha.bd@gmail.com...`,
							);
							const fallbackResponse = await fetch(
								"https://api.resend.com/emails",
								{
									method: "POST",
									headers: {
										Authorization: `Bearer ${env.RESEND_API_KEY}`,
										"Content-Type": "application/json",
									},
									body: JSON.stringify({
										from: "onboarding@resend.dev",
										to: "rashedulraha.bd@gmail.com",
										subject: `[UpNode] Verify Your Email Address (${email})`,
										html: htmlContent,
									}),
								},
							);

							if (!fallbackResponse.ok) {
								const fallbackError = await fallbackResponse.text();
								throw new Error(
									`Resend fallback status ${fallbackResponse.status}: ${fallbackError}`,
								);
							}
						} else {
							throw new Error(`Resend status ${response.status}: ${errorText}`);
						}
					}

					logger.info(
						{ event: "VERIFICATION_EMAIL_SENT", email },
						`[Better Auth] Verification email sent via Resend.`,
					);
				} catch (err: any) {
					logger.error(
						{ event: "VERIFICATION_EMAIL_ERROR", email, error: err.message },
						`[Better Auth Error] Failed to send verification email: ${err.message}`,
					);
					logger.info(
						{ event: "VERIFICATION_EMAIL_FALLBACK", email },
						`[Better Auth Fallback Link] ✉️ Verification link for ${email}: ${clientVerificationUrl}`,
					);
				}
			} else {
				logger.info(
					{ event: "VERIFICATION_EMAIL_SIMULATED", email },
					`[Better Auth Simulated Email] ✉️ Email verification link for ${email}: ${clientVerificationUrl}`,
				);
			}
		},
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,

		sendResetPassword: async ({ user, url }) => {
			const email = user.email;

			let clientResetPasswordUrl = url;
			try {
				const parsedUrl = new URL(url);
				const token = parsedUrl.searchParams.get("token");
				if (token) {
					clientResetPasswordUrl = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
				}
			} catch {
				// Fallback to original url
			}

			const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin: 0 0 12px 0; font-size: 20px; font-weight: 700; text-transform: uppercase; font-family: monospace;">[UPNODE] Password Reset Request</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">Hi ${user.name || "there"},</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">We received a request to reset your password. Click the button below to set a new password:</p>
          <p style="margin-bottom: 24px;">
            <a href="${clientResetPasswordUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 0px; font-weight: 600; font-family: monospace; font-size: 12px; border: 1px solid #000000; text-transform: uppercase;">[RESET_PASSWORD]</a>
          </p>
          <p style="color: #64748b; font-size: 12px; line-height: 1.5; border-top: 1px solid #edf2f7; padding-top: 16px; margin-top: 24px; font-family: monospace;">
            If you did not request this, you can safely ignore this email.
          </p>
        </div>
      `;

			// Always print link clearly in terminal console for easy localhost testing
			console.log(
				`\n=================================================================`,
			);
			console.log(`🔑 [UPNODE PASSWORD RESET LINK FOR: ${email}]`);
			console.log(`👉 ${clientResetPasswordUrl}`);
			console.log(
				`=================================================================\n`,
			);

			if (env.RESEND_API_KEY) {
				try {
					const fromEmail = env.EMAIL_FROM || "onboarding@resend.dev";
					const response = await fetch("https://api.resend.com/emails", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${env.RESEND_API_KEY}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							from: fromEmail,
							to: email,
							subject: "[UpNode] Password Reset Request",
							html: htmlContent,
						}),
					});

					if (!response.ok) {
						const errorText = await response.text();
						if (
							errorText.includes("only send to your own email") ||
							errorText.includes("domain") ||
							response.status === 403
						) {
							logger.warn(
								`[Better Auth Resend Fallback] Resend default domain restriction detected. Retrying password reset dispatch to account owner rashedulraha.bd@gmail.com...`,
							);
							const fallbackResponse = await fetch(
								"https://api.resend.com/emails",
								{
									method: "POST",
									headers: {
										Authorization: `Bearer ${env.RESEND_API_KEY}`,
										"Content-Type": "application/json",
									},
									body: JSON.stringify({
										from: "onboarding@resend.dev",
										to: "rashedulraha.bd@gmail.com",
										subject: `[UpNode] Password Reset Request (${email})`,
										html: htmlContent,
									}),
								},
							);

							if (!fallbackResponse.ok) {
								const fallbackError = await fallbackResponse.text();
								throw new Error(
									`Resend fallback status ${fallbackResponse.status}: ${fallbackError}`,
								);
							}
						} else {
							throw new Error(`Resend status ${response.status}: ${errorText}`);
						}
					}

					logger.info(
						{ event: "PASSWORD_RESET_EMAIL_SENT", email },
						`[Better Auth] Reset password email sent via Resend.`,
					);
				} catch (err: any) {
					logger.error(
						{ event: "PASSWORD_RESET_EMAIL_ERROR", email, error: err.message },
						`[Better Auth Error] Failed to send reset password email: ${err.message}`,
					);
					logger.info(
						{ event: "PASSWORD_RESET_EMAIL_FALLBACK", email },
						`[Better Auth Fallback Link] 🔑 Password reset link for ${email}: ${clientResetPasswordUrl}`,
					);
				}
			} else {
				logger.info(
					{ event: "PASSWORD_RESET_EMAIL_SIMULATED", email },
					`[Better Auth Simulated Email] 🔑 Reset password link for ${email}: ${clientResetPasswordUrl}`,
				);
			}
		},
	},
});
