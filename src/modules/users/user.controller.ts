import { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { auth } from "../../lib/auth";
import { fromNodeHeaders } from "better-auth/node";

export class UserController {
  /**
   * GET /api/users/me/notifications
   * Returns notification preferences for the current user.
   * Auto-creates defaults (both true) if they don't exist yet.
   */
  async getNotificationPreferences(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = req.user!.id;

      const prefs = await prisma.userNotificationPreference.upsert({
        where: { userId },
        create: { userId, emailEnabled: true, slackEnabled: true },
        update: {},
      });

      res.json(prefs);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/me/notifications
   * Updates notification preferences (emailEnabled and/or slackEnabled).
   */
  async updateNotificationPreferences(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = req.user!.id;
      const { emailEnabled, slackEnabled } = req.body;

      const prefs = await prisma.userNotificationPreference.upsert({
        where: { userId },
        create: {
          userId,
          emailEnabled: emailEnabled ?? true,
          slackEnabled: slackEnabled ?? true,
        },
        update: {
          ...(emailEnabled !== undefined && { emailEnabled }),
          ...(slackEnabled !== undefined && { slackEnabled }),
        },
      });

      res.json({ success: true, preferences: prefs });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/me/sessions
   * Proxies better-auth listSessions through the server so the client
   * doesn't need a direct auth route call.
   */
  async listSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const sessions = await auth.api.listSessions({
        headers: fromNodeHeaders(req.headers),
      });
      res.json(sessions ?? []);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/users/me/sessions/:sessionToken
   * Revokes a specific session by token.
   */
  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionToken = String(req.params.sessionToken);
      await auth.api.revokeSession({
        headers: fromNodeHeaders(req.headers),
        body: { token: sessionToken },
      });
      res.json({ success: true, message: "Session revoked." });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
