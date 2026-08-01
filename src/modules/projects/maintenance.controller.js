import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../middlewares/error.middleware";
import { logger } from "../../lib/logger";
export class MaintenanceController {
    /**
     * PATCH /projects/:id/maintenance
     * Sets maintenanceMode, maintenanceStart, maintenanceEnd on a project.
     * Requires ADMIN role (enforced in routes).
     */
    async updateMaintenance(req, res, next) {
        try {
            const projectId = String(req.params.id);
            const organizationId = req.organizationId;
            const { maintenanceMode, maintenanceStart, maintenanceEnd } = req.body;
            // Verify project belongs to caller's organization
            const project = await prisma.project.findFirst({
                where: { id: projectId, organizationId },
            });
            if (!project) {
                throw new NotFoundError(`Project with ID '${projectId}' not found in your organization.`);
            }
            const updated = await prisma.project.update({
                where: { id: projectId },
                data: {
                    ...(maintenanceMode !== undefined && { maintenanceMode }),
                    ...(maintenanceStart !== undefined && {
                        maintenanceStart: maintenanceStart ? new Date(maintenanceStart) : null,
                    }),
                    ...(maintenanceEnd !== undefined && {
                        maintenanceEnd: maintenanceEnd ? new Date(maintenanceEnd) : null,
                    }),
                },
                select: {
                    id: true,
                    name: true,
                    maintenanceMode: true,
                    maintenanceStart: true,
                    maintenanceEnd: true,
                },
            });
            const modeLabel = updated.maintenanceMode ? "ENABLED" : "DISABLED";
            logger.info(`[Maintenance] Project "${updated.name}" (${projectId}) maintenance mode ${modeLabel}` +
                (updated.maintenanceStart
                    ? ` | Window: ${updated.maintenanceStart.toISOString()} → ${updated.maintenanceEnd?.toISOString() ?? "open"}`
                    : ""));
            res.json({
                success: true,
                project: updated,
                message: `Maintenance mode ${modeLabel.toLowerCase()} for project "${updated.name}".`,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * GET /projects/:id/maintenance
     * Returns the current maintenance state for a project.
     */
    async getMaintenance(req, res, next) {
        try {
            const projectId = String(req.params.id);
            const organizationId = req.organizationId;
            const project = await prisma.project.findFirst({
                where: { id: projectId, organizationId },
                select: {
                    id: true,
                    name: true,
                    maintenanceMode: true,
                    maintenanceStart: true,
                    maintenanceEnd: true,
                },
            });
            if (!project) {
                throw new NotFoundError(`Project with ID '${projectId}' not found.`);
            }
            // Compute whether window is currently active
            const now = new Date();
            const isScheduledWindowActive = !project.maintenanceMode &&
                project.maintenanceStart !== null &&
                project.maintenanceEnd !== null &&
                now >= project.maintenanceStart &&
                now <= project.maintenanceEnd;
            const isCurrentlyInMaintenance = project.maintenanceMode || isScheduledWindowActive;
            res.json({
                ...project,
                isCurrentlyInMaintenance,
                isScheduledWindowActive,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
export const maintenanceController = new MaintenanceController();
