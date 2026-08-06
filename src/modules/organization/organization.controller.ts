import { Request, Response, NextFunction } from "express";
import { organizationService } from "./organization.service";

export class OrganizationController {
  async getMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const members = await organizationService.getOrganizationMembers(organizationId);
      res.json(members);
    } catch (error) {
      next(error);
    }
  }

  async inviteMember(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const member = await organizationService.inviteMember(organizationId, req.body);
      res.status(201).json(member);
    } catch (error) {
      next(error);
    }
  }

  async updateMemberRole(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const memberId = String(req.params.memberId);
      const updated = await organizationService.updateMemberRole(organizationId, memberId, req.body);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  }

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const memberId = String(req.params.memberId);
      const result = await organizationService.removeMember(organizationId, memberId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getIntegrations(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const integrations = await organizationService.getIntegrations(organizationId);
      res.json(integrations);
    } catch (error) {
      next(error);
    }
  }

  async updateIntegrations(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const integrations = await organizationService.updateIntegrations(organizationId, req.body);
      res.json(integrations);
    } catch (error) {
      next(error);
    }
  }

  async createOrganization(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        res.status(400).json({ error: "Organization name must be at least 2 characters." });
        return;
      }
      const org = await organizationService.createOrganization(userId, name.trim());
      res.status(201).json(org);
    } catch (error) {
      next(error);
    }
  }

  async getUserOrganizations(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const orgs = await organizationService.getUserOrganizations(user.id, user.role);
      res.json(orgs);
    } catch (error) {
      next(error);
    }
  }
}

export const organizationController = new OrganizationController();
