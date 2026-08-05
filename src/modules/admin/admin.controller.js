import { adminService } from "./admin.service";
export class AdminController {
    async toggleBlockUser(req, res, next) {
        try {
            const userId = String(req.params.userId);
            const { isBlocked } = req.body;
            if (typeof isBlocked !== "boolean") {
                res.status(400).json({ error: "Bad Request: 'isBlocked' boolean field is required." });
                return;
            }
            const updatedUser = await adminService.toggleBlockUser(userId, isBlocked);
            res.json({
                message: `User ${isBlocked ? "blocked" : "unblocked"} successfully.`,
                user: updatedUser,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteUserAccount(req, res, next) {
        try {
            const userId = String(req.params.userId);
            const result = await adminService.deleteUserAccount(userId);
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    }
    async deleteOrganization(req, res, next) {
        try {
            const organizationId = String(req.params.organizationId);
            const result = await adminService.deleteOrganization(organizationId);
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    }
    async getAllOrganizations(req, res, next) {
        try {
            const organizations = await adminService.getAllOrganizations();
            res.json(organizations);
        }
        catch (error) {
            next(error);
        }
    }
    async getAllUsers(req, res, next) {
        try {
            const users = await adminService.getAllUsers();
            res.json(users);
        }
        catch (error) {
            next(error);
        }
    }
    async getStats(req, res, next) {
        try {
            const stats = await adminService.getStats();
            res.json(stats);
        }
        catch (error) {
            next(error);
        }
    }
}
export const adminController = new AdminController();
