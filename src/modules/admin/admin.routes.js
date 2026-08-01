import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../../middlewares/auth.middleware";
import { adminController } from "./admin.controller";
export const adminRoutes = Router();
// Protect all admin routes with authentication and requireSuperAdmin middleware
adminRoutes.use(requireAuth, requireSuperAdmin);
adminRoutes.get("/stats", (req, res, next) => adminController.getStats(req, res, next));
adminRoutes.get("/users", (req, res, next) => adminController.getAllUsers(req, res, next));
adminRoutes.get("/organizations", (req, res, next) => adminController.getAllOrganizations(req, res, next));
adminRoutes.delete("/organizations/:organizationId", (req, res, next) => adminController.deleteOrganization(req, res, next));
adminRoutes.patch("/users/:userId/block", (req, res, next) => adminController.toggleBlockUser(req, res, next));
adminRoutes.delete("/users/:userId", (req, res, next) => adminController.deleteUserAccount(req, res, next));
