import { Router } from "express";
import { projectController } from "./project.controller";
import { requireAuth, requireOrganization, requireRole } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { createProjectSchema, projectParamsSchema, updateProjectSchema } from "./project.validation";

const router = Router();

// Public Unauthenticated Status Page Endpoint
router.get("/public/:slug/status", (req, res, next) => projectController.getPublicStatus(req, res, next));

// Authenticated Organization Endpoints
router.use(requireAuth);
router.use(requireOrganization);

router.post(
  "/",
  requireRole("ADMIN", "ENGINEER"),
  validateRequest({ body: createProjectSchema }),
  projectController.create.bind(projectController)
);

router.get(
  "/",
  requireRole("ADMIN", "ENGINEER", "VIEWER"),
  projectController.getAll.bind(projectController)
);

router.get(
  "/:id",
  requireRole("ADMIN", "ENGINEER", "VIEWER"),
  validateRequest({ params: projectParamsSchema }),
  projectController.getById.bind(projectController)
);

router.patch(
  "/:id",
  requireRole("ADMIN", "ENGINEER"),
  validateRequest({ params: projectParamsSchema, body: updateProjectSchema }),
  projectController.update.bind(projectController)
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  validateRequest({ params: projectParamsSchema }),
  projectController.delete.bind(projectController)
);

export { router as projectRoutes };
