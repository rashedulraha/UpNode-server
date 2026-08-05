import { incidentService } from "./incident.service";
export class IncidentController {
    async create(req, res, next) {
        try {
            const organizationId = req.organizationId;
            const incident = await incidentService.createIncident(req.body, organizationId);
            res.status(201).json(incident);
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = String(req.params.id);
            const organizationId = req.organizationId;
            const updated = await incidentService.updateIncident(id, req.body, organizationId);
            res.json(updated);
        }
        catch (error) {
            next(error);
        }
    }
    async getAll(req, res, next) {
        try {
            const organizationId = req.organizationId;
            const result = await incidentService.getIncidents(organizationId, req.query);
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const id = String(req.params.id);
            const organizationId = req.organizationId;
            const incident = await incidentService.getIncidentById(id, organizationId);
            res.json(incident);
        }
        catch (error) {
            next(error);
        }
    }
}
export const incidentController = new IncidentController();
