import { Router } from "express";
import { organizationController } from "./organization.controller";
import {
	requireAuth,
	requireOrganization,
	requireRole,
} from "../../middlewares/auth.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import {
	inviteMemberSchema,
	updateMemberRoleSchema,
} from "./organization.validation";
import { UserRole, UserRole as Role } from "@prisma/client";

const router = Router();

// Apply auth to all organization endpoints
router.use(requireAuth);

// Routes that don't need an existing organization context
router.post("/create", (req, res, next) =>
	organizationController.createOrganization(req, res, next),
);
router.get("/my", (req, res, next) =>
	organizationController.getUserOrganizations(req, res, next),
);

// Apply organization context middleware to remaining endpoints
router.use(requireOrganization);

router.get("/members", (req, res, next) =>
	organizationController.getMembers(req, res, next),
);
router.post(
	"/members/invite",
	validateBody(inviteMemberSchema),
	(req, res, next) => organizationController.inviteMember(req, res, next),
);
router.patch(
	"/members/:memberId",
	validateBody(updateMemberRoleSchema),
	(req, res, next) => organizationController.updateMemberRole(req, res, next),
);
router.delete("/members/:memberId", (req, res, next) =>
	organizationController.removeMember(req, res, next),
);

// Integration Settings Endpoints (Admin & Super Admin)
router.get("/integrations", (req, res, next) =>
	organizationController.getIntegrations(req, res, next),
);
router.put("/integrations", requireRole(Role.ADMIN), (req, res, next) =>
	organizationController.updateIntegrations(req, res, next),
);

export const organizationRoutes = router;
