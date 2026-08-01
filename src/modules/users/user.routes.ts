import { Router } from "express";
import { userController } from "./user.controller";
import { requireAuth } from "../../middlewares/auth.middleware";

const router = Router();

// All user routes require authentication
router.use(requireAuth);

// ─── Notification Preferences ────────────────────────────────────────────────
router.get(
  "/me/notifications",
  userController.getNotificationPreferences.bind(userController)
);

router.patch(
  "/me/notifications",
  userController.updateNotificationPreferences.bind(userController)
);

// ─── Session Management ──────────────────────────────────────────────────────
router.get(
  "/me/sessions",
  userController.listSessions.bind(userController)
);

router.delete(
  "/me/sessions/:sessionToken",
  userController.revokeSession.bind(userController)
);

export { router as userRoutes };
