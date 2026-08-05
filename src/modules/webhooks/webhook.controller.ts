import { Request, Response, NextFunction } from "express";
import { webhookService } from "./webhook.service";

export class WebhookController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const webhook = await webhookService.createWebhook(req.body, organizationId);
      res.status(201).json(webhook);
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const projectId = req.query.projectId as string | undefined;
      const webhooks = await webhookService.getWebhooks(organizationId, projectId);
      res.json(webhooks);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const webhook = await webhookService.getWebhookById(id, organizationId);
      res.json(webhook);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const webhook = await webhookService.updateWebhook(id, req.body, organizationId);
      res.json(webhook);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await webhookService.deleteWebhook(id, organizationId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async test(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await webhookService.testWebhook(id, organizationId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const webhookController = new WebhookController();
