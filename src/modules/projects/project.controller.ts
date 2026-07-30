import { Request, Response, NextFunction } from "express";
import { projectService } from "./project.service";

export class ProjectController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!;
      const projects = await projectService.getProjectsByOrganization(organizationId);
      res.json(projects);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const organizationId = req.organizationId!;
      const project = await projectService.getProjectById(id, organizationId);
      res.json(project);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, apiKey } = req.body;
      const organizationId = req.organizationId!;
      const project = await projectService.createProject({ name, apiKey }, organizationId);
      res.status(201).json(project);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const organizationId = req.organizationId!;
      const updated = await projectService.updateProject(id, req.body, organizationId);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const organizationId = req.organizationId!;
      await projectService.deleteProject(id, organizationId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const projectController = new ProjectController();
