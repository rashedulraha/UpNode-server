import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { env } from "../config/env";
import { Role } from "@prisma/client";
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
  accountLinking: {
    enabled: true,
    trustedProviders: ["google", "github"],
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: Role.VIEWER,
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
        before: async (user) => {
          const userCount = await prisma.user.count();
          const role = userCount === 0 ? Role.SUPER_ADMIN : Role.VIEWER;
          return {
            data: {
              ...user,
              role,
            },
          };
        },
      },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const email = user.email;
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin: 0 0 12px 0; font-size: 20px; font-weight: 700; text-transform: uppercase; font-family: monospace;">[UPNODE] Verify Your Email Address</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">Hi ${user.name || "there"},</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">Thank you for registering on UpNode. Click the button below to verify your email address and activate your telemetry portal access:</p>
          <p style="margin-bottom: 24px;">
            <a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 0px; font-weight: 600; font-family: monospace; font-size: 12px; border: 1px solid #000000; text-transform: uppercase;">[VERIFY_EMAIL]</a>
          </p>
          <p style="color: #64748b; font-size: 12px; line-height: 1.5; border-top: 1px solid #edf2f7; padding-top: 16px; margin-top: 24px; font-family: monospace;">
            If you did not create an account on UpNode, you can safely ignore this email.
          </p>
        </div>
      `;

      if (env.RESEND_API_KEY) {
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: env.EMAIL_FROM || "alerts@upnode.dev",
              to: email,
              subject: "[UpNode] Verify Your Email Address",
              html: htmlContent,
            }),
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Resend responded with status ${response.status}: ${errorText}`);
          }
          logger.info({ event: "VERIFICATION_EMAIL_SENT", email }, `[Better Auth] Verification email sent to ${email} via Resend.`);
        } catch (err: any) {
          logger.error({ event: "VERIFICATION_EMAIL_ERROR", email, error: err.message }, `[Better Auth Error] Failed to send verification email: ${err.message}`);
        }
      } else {
        logger.info({ event: "VERIFICATION_EMAIL_SIMULATED", email }, `[Better Auth Simulated Email] ✉️ Email verification link for ${email}: ${url}`);
      }
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const email = user.email;
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin: 0 0 12px 0; font-size: 20px; font-weight: 700; text-transform: uppercase; font-family: monospace;">[UPNODE] Password Reset Request</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">Hi ${user.name || "there"},</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">We received a request to reset your password. Click the button below to set a new password:</p>
          <p style="margin-bottom: 24px;">
            <a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 0px; font-weight: 600; font-family: monospace; font-size: 12px; border: 1px solid #000000; text-transform: uppercase;">[RESET_PASSWORD]</a>
          </p>
          <p style="color: #64748b; font-size: 12px; line-height: 1.5; border-top: 1px solid #edf2f7; padding-top: 16px; margin-top: 24px; font-family: monospace;">
            If you did not request this, you can safely ignore this email.
          </p>
        </div>
      `;

      if (env.RESEND_API_KEY) {
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: env.EMAIL_FROM || "alerts@upnode.dev",
              to: email,
              subject: "[UpNode] Password Reset Request",
              html: htmlContent,
            }),
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Resend responded with status ${response.status}: ${errorText}`);
          }
          logger.info({ event: "PASSWORD_RESET_EMAIL_SENT", email }, `[Better Auth] Reset password email sent to ${email} via Resend.`);
        } catch (err: any) {
          logger.error({ event: "PASSWORD_RESET_EMAIL_ERROR", email, error: err.message }, `[Better Auth Error] Failed to send reset password email: ${err.message}`);
        }
      } else {
        logger.info({ event: "PASSWORD_RESET_EMAIL_SIMULATED", email }, `[Better Auth Simulated Email] ✉️ Reset password link for ${email}: ${url}`);
      }
    },
  },
});
