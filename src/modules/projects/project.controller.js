import { projectService } from "./project.service";
export class ProjectController {
    async getAll(req, res, next) {
        try {
            const organizationId = req.organizationId;
            const projects = await projectService.getProjectsByOrganization(organizationId);
            res.json(projects);
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const id = String(req.params.id);
            const organizationId = req.organizationId;
            const project = await projectService.getProjectById(id, organizationId);
            res.json(project);
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const { name, slug, url, apiKey } = req.body;
            const organizationId = req.organizationId;
            const project = await projectService.createProject({ name, slug, url, apiKey }, organizationId);
            res.status(201).json(project);
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = String(req.params.id);
            const organizationId = req.organizationId;
            const updated = await projectService.updateProject(id, req.body, organizationId);
            res.json(updated);
        }
        catch (error) {
            next(error);
        }
    }
    async delete(req, res, NextFunction) {
        try {
            const id = String(req.params.id);
            const organizationId = req.organizationId;
            await projectService.deleteProject(id, organizationId);
            res.status(204).send();
        }
        catch (error) {
            NextFunction(error);
        }
    }
    async getPublicStatus(req, res, next) {
        try {
            const slug = String(req.params.slug);
            const statusData = await projectService.getPublicProjectStatus(slug);
            res.json(statusData);
        }
        catch (error) {
            next(error);
        }
    }
    async subscribePublic(req, res, next) {
        try {
            const slug = String(req.params.slug);
            const { email } = req.body;
            const result = await projectService.subscribeToStatusUpdates(slug, email);
            res.status(200).json(result);
        }
        catch (error) {
            next(error);
        }
    }
    async unsubscribe(req, res, next) {
        try {
            const email = String(req.query.email || req.body.email || "");
            const projectId = String(req.query.projectId || req.query.project || req.body.projectId || "");
            const token = String(req.query.token || req.body.token || "");
            const result = await projectService.unsubscribeFromStatusUpdates(email, projectId, token);
            res.status(200).json(result);
        }
        catch (error) {
            next(error);
        }
    }
}
export const projectController = new ProjectController();
