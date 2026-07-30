import { Router } from "express";
import { projectController } from "./project.controller";
import { requireAuth, requireOrganization, requireRole } from "../../middlewares/auth.middleware";

const router = Router();

// All project routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrganization);

// Apply RBAC: Only ADMIN and ENGINEER can create projects
router.post("/", requireRole("ADMIN", "ENGINEER"), projectController.create.bind(projectController));

// Any role in the organization can view projects
router.get("/", requireRole("ADMIN", "ENGINEER", "VIEWER"), projectController.getAll.bind(projectController));
router.get("/:id", requireRole("ADMIN", "ENGINEER", "VIEWER"), projectController.getById.bind(projectController));

export { router as projectRoutes };
