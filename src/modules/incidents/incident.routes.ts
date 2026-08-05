import { Router } from "express";
import { incidentController } from "./incident.controller";
import { requireAuth, requireOrganization, requireRole } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { incidentMutationRateLimiter } from "../../middlewares/rateLimit.middleware";
import {
  createIncidentSchema,
  updateIncidentSchema,
  incidentParamsSchema,
  incidentQuerySchema,
} from "./incident.validation";

const router = Router();

router.use(requireAuth);
router.use(requireOrganization);

router.post(
  "/",
  requireRole("ADMIN", "ENGINEER"),
  incidentMutationRateLimiter,
  validateRequest({ body: createIncidentSchema }),
  incidentController.create.bind(incidentController)
);

router.get(
  "/",
  requireRole("ADMIN", "ENGINEER", "VIEWER"),
  validateRequest({ query: incidentQuerySchema }),
  incidentController.getAll.bind(incidentController)
);

router.get(
  "/:id",
  requireRole("ADMIN", "ENGINEER", "VIEWER"),
  validateRequest({ params: incidentParamsSchema }),
  incidentController.getById.bind(incidentController)
);

router.patch(
  "/:id",
  requireRole("ADMIN", "ENGINEER"),
  incidentMutationRateLimiter,
  validateRequest({ params: incidentParamsSchema, body: updateIncidentSchema }),
  incidentController.update.bind(incidentController)
);

export { router as incidentRoutes };
