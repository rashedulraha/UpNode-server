import { Router } from "express";
import { organizationController } from "./organization.controller";
import { requireAuth, requireOrganization } from "../../middlewares/auth.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import { inviteMemberSchema, updateMemberRoleSchema } from "./organization.validation";

const router = Router();

// Apply auth & organization context middleware to all organization endpoints
router.use(requireAuth);
router.use(requireOrganization);

router.get("/members", (req, res, next) => organizationController.getMembers(req, res, next));
router.post("/members/invite", validateBody(inviteMemberSchema), (req, res, next) =>
  organizationController.inviteMember(req, res, next)
);
router.patch("/members/:memberId", validateBody(updateMemberRoleSchema), (req, res, next) =>
  organizationController.updateMemberRole(req, res, next)
);
router.delete("/members/:memberId", (req, res, next) =>
  organizationController.removeMember(req, res, next)
);

export const organizationRoutes = router;
