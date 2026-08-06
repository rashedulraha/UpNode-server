import { z } from "zod";
import { IncidentStatus, IncidentSeverity } from "@prisma/client";

export const createIncidentSchema = z.object({
	title: z.string().min(1, "Title is required").max(200),
	description: z.string().min(1, "Description is required"),
	projectId: z.string().min(1, "Project ID is required"),
	status: z.nativeEnum(IncidentStatus).default(IncidentStatus.INVESTIGATING),
	severity: z.nativeEnum(IncidentSeverity).default(IncidentSeverity.MEDIUM),
});

export const updateIncidentSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	description: z.string().min(1).optional(),
	status: z.nativeEnum(IncidentStatus).optional(),
	severity: z.nativeEnum(IncidentSeverity).optional(),
	expectedVersion: z
		.number({ message: "expectedVersion must be a valid number" })
		.int()
		.min(1),
});

export const incidentParamsSchema = z.object({
	id: z.string().min(1, "Incident ID is required"),
});

export const incidentQuerySchema = z.object({
	projectId: z.string().optional(),
	status: z.nativeEnum(IncidentStatus).optional(),
	severity: z.nativeEnum(IncidentSeverity).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional().default(50),
	offset: z.coerce.number().int().min(0).optional().default(0),
});
