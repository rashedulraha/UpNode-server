import { Request, Response } from "express";
import { projectService } from "./project.service";

export class ProjectController {
  async getAll(req: Request, res: Response) {
    try {
      const organizationId = req.organizationId!;
      const projects = await projectService.getProjectsByOrganization(organizationId);
      res.json(projects);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId!;
      const project = await projectService.getProjectById(id, organizationId);
      
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      
      res.json(project);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { name, apiKey } = req.body;
      const organizationId = req.organizationId!;
      
      if (!name || !apiKey) {
        res.status(400).json({ error: "Name and apiKey are required" });
        return;
      }

      const project = await projectService.createProject({ name, apiKey }, organizationId);
      res.status(201).json(project);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

export const projectController = new ProjectController();
