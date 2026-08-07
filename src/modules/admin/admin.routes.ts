import { Router } from "express";
import { adminController } from "./admin.controller";
import {
	requireAuth,
	requireSuperAdmin,
} from "../../middlewares/auth.middleware";

const router = Router();

// Require user authentication & SUPER_ADMIN role for all admin endpoints
router.use(requireAuth);
router.use(requireSuperAdmin);

router.get("/stats", (req, res, next) =>
	adminController.getStats(req, res, next),
);
router.get("/users", (req, res, next) =>
	adminController.getUsers(req, res, next),
);
router.post("/users/:userId/toggle-block", (req, res, next) =>
	adminController.toggleUserBlock(req, res, next),
);
router.get("/organizations", (req, res, next) =>
	adminController.getOrganizations(req, res, next),
);
router.post("/organizations/:orgId/toggle-suspend", (req, res, next) =>
	adminController.toggleOrganizationSuspend(req, res, next),
);

export const adminRoutes = router;
