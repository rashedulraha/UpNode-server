import { organizationService } from "./organization.service";
export class OrganizationController {
    async getMembers(req, res, next) {
        try {
            const organizationId = req.organizationId;
            const members = await organizationService.getOrganizationMembers(organizationId);
            res.json(members);
        }
        catch (error) {
            next(error);
        }
    }
    async inviteMember(req, res, next) {
        try {
            const organizationId = req.organizationId;
            const member = await organizationService.inviteMember(organizationId, req.body);
            res.status(201).json(member);
        }
        catch (error) {
            next(error);
        }
    }
    async updateMemberRole(req, res, next) {
        try {
            const organizationId = req.organizationId;
            const memberId = String(req.params.memberId);
            const updated = await organizationService.updateMemberRole(organizationId, memberId, req.body);
            res.json(updated);
        }
        catch (error) {
            next(error);
        }
    }
    async removeMember(req, res, next) {
        try {
            const organizationId = req.organizationId;
            const memberId = String(req.params.memberId);
            const result = await organizationService.removeMember(organizationId, memberId);
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    }
    async getIntegrations(req, res, next) {
        try {
            const organizationId = req.organizationId;
            const integrations = await organizationService.getIntegrations(organizationId);
            res.json(integrations);
        }
        catch (error) {
            next(error);
        }
    }
    async updateIntegrations(req, res, next) {
        try {
            const organizationId = req.organizationId;
            const integrations = await organizationService.updateIntegrations(organizationId, req.body);
            res.json(integrations);
        }
        catch (error) {
            next(error);
        }
    }
    async createOrganization(req, res, next) {
        try {
            const userId = req.user.id;
            const { name } = req.body;
            if (!name || typeof name !== "string" || name.trim().length < 2) {
                res.status(400).json({ error: "Organization name must be at least 2 characters." });
                return;
            }
            const org = await organizationService.createOrganization(userId, name.trim());
            res.status(201).json(org);
        }
        catch (error) {
            next(error);
        }
    }
    async getUserOrganizations(req, res, next) {
        try {
            const userId = req.user.id;
            const orgs = await organizationService.getUserOrganizations(userId);
            res.json(orgs);
        }
        catch (error) {
            next(error);
        }
    }
}
export const organizationController = new OrganizationController();
