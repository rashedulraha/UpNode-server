import { Router } from "express";
import { projectController } from "./project.controller";
import { maintenanceController } from "./maintenance.controller";
import { requireAuth, requireOrganization, requireRole } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { createProjectSchema, projectParamsSchema, updateProjectSchema, maintenanceSchema } from "./project.validation";
const router = Router();
// Public Unauthenticated Status Page Endpoints
router.get("/public/:slug/status", (req, res, next) => projectController.getPublicStatus(req, res, next));
router.post("/public/:slug/subscribe", (req, res, next) => projectController.subscribePublic(req, res, next));
// Authenticated Organization Endpoints
router.use(requireAuth);
router.use(requireOrganization);
router.post("/", requireRole("ADMIN", "ENGINEER"), validateRequest({ body: createProjectSchema }), projectController.create.bind(projectController));
router.get("/", requireRole("ADMIN", "ENGINEER", "VIEWER"), projectController.getAll.bind(projectController));
router.get("/:id", requireRole("ADMIN", "ENGINEER", "VIEWER"), validateRequest({ params: projectParamsSchema }), projectController.getById.bind(projectController));
router.patch("/:id", requireRole("ADMIN", "ENGINEER"), validateRequest({ params: projectParamsSchema, body: updateProjectSchema }), projectController.update.bind(projectController));
router.delete("/:id", requireRole("ADMIN"), validateRequest({ params: projectParamsSchema }), projectController.delete.bind(projectController));
// ─── Maintenance Window Endpoints ───────────────────────────────────────────────
router.get("/:id/maintenance", requireRole("ADMIN", "ENGINEER", "VIEWER"), validateRequest({ params: projectParamsSchema }), maintenanceController.getMaintenance.bind(maintenanceController));
router.patch("/:id/maintenance", requireRole("ADMIN"), validateRequest({ params: projectParamsSchema, body: maintenanceSchema }), maintenanceController.updateMaintenance.bind(maintenanceController));
export { router as projectRoutes };
