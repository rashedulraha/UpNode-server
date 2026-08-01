import { z } from "zod";
export const createProjectSchema = z.object({
    name: z.string().min(1, "Project name is required").max(100),
    slug: z.string().min(1).max(100).optional(),
    url: z.string().optional(),
    apiKey: z.string().min(1, "API key is required").optional(),
});
export const projectParamsSchema = z.object({
    id: z.string().uuid("Invalid project ID format"),
});
export const updateProjectSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    slug: z.string().min(1).max(100).optional(),
    url: z.string().optional(),
    apiKey: z.string().min(1).optional(),
});
/**
 * Schema for the dedicated maintenance window PATCH endpoint.
 * All fields are optional so callers can set only what they need.
 */
export const maintenanceSchema = z.object({
    maintenanceMode: z.boolean().optional(),
    maintenanceStart: z.string().datetime({ offset: true }).nullable().optional(),
    maintenanceEnd: z.string().datetime({ offset: true }).nullable().optional(),
});
