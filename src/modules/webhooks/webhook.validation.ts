import { z } from "zod";

export const createWebhookSchema = z.object({
  url: z.string().url("Must be a valid HTTP or HTTPS URL"),
  secret: z.string().optional(),
  events: z.array(z.string()).optional().default(["incident.created", "incident.resolved"]),
  projectId: z.string().optional(),
  enabled: z.boolean().optional().default(true),
});

export const updateWebhookSchema = z.object({
  url: z.string().url("Must be a valid HTTP or HTTPS URL").optional(),
  secret: z.string().nullable().optional(),
  events: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export const webhookParamsSchema = z.object({
  id: z.string().uuid("Invalid webhook ID"),
});
