import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  apiKey: z.string().min(1, "API key is required").optional(),
});

export const projectParamsSchema = z.object({
  id: z.string().uuid("Invalid project ID format"),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).optional(),
});
