import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../middlewares/error.middleware";
import { logger } from "../../lib/logger";
import crypto from "crypto";

export interface CreateWebhookInput {
	url: string;
	secret?: string;
	events?: string[];
	projectId?: string;
	enabled?: boolean;
}

export interface UpdateWebhookInput {
	url?: string;
	secret?: string | null;
	events?: string[];
	enabled?: boolean;
}

export class WebhookService {
	async createWebhook(input: CreateWebhookInput, organizationId: string) {
		if (input.projectId) {
			const project = await prisma.project.findFirst({
				where: { id: input.projectId, organizationId },
			});
			if (!project) {
				throw new NotFoundError(
					`Project '${input.projectId}' not found in organization.`,
				);
			}
		}

		const webhook = await prisma.webhook.create({
			data: {
				url: input.url,
				secret: input.secret || null,
				events:
					input.events && input.events.length > 0
						? input.events
						: ["incident.created", "incident.resolved"],
				enabled: input.enabled !== undefined ? input.enabled : true,
				organizationId,
				projectId: input.projectId || null,
			},
		});

		logger.info(
			{
				event: "WEBHOOK_CREATED",
				webhookId: webhook.id,
				url: webhook.url,
				organizationId,
			},
			`[Webhook] Created custom webhook endpoint ${webhook.id} -> ${webhook.url}`,
		);

		return webhook;
	}

	async getWebhooks(organizationId: string, projectId?: string) {
		const where: any = { organizationId };
		if (projectId) {
			where.OR = [{ projectId }, { projectId: null }];
		}

		return prisma.webhook.findMany({
			where,
			orderBy: { createdAt: "desc" },
			include: {
				project: {
					select: { id: true, name: true },
				},
			},
		});
	}

	async getWebhookById(id: string, organizationId: string) {
		const webhook = await prisma.webhook.findFirst({
			where: { id, organizationId },
			include: {
				project: {
					select: { id: true, name: true },
				},
			},
		});

		if (!webhook) {
			throw new NotFoundError(`Webhook with ID '${id}' not found.`);
		}

		return webhook;
	}

	async updateWebhook(
		id: string,
		input: UpdateWebhookInput,
		organizationId: string,
	) {
		await this.getWebhookById(id, organizationId);

		const updated = await prisma.webhook.update({
			where: { id },
			data: {
				...(input.url !== undefined && { url: input.url }),
				...(input.secret !== undefined && { secret: input.secret }),
				...(input.events !== undefined && { events: input.events }),
				...(input.enabled !== undefined && { enabled: input.enabled }),
			},
		});

		return updated;
	}

	async deleteWebhook(id: string, organizationId: string) {
		await this.getWebhookById(id, organizationId);

		await prisma.webhook.delete({
			where: { id },
		});

		logger.info(
			{ event: "WEBHOOK_DELETED", webhookId: id, organizationId },
			`[Webhook] Deleted custom webhook ${id}`,
		);
		return { success: true, message: `Webhook '${id}' deleted successfully.` };
	}

	async testWebhook(id: string, organizationId: string) {
		const webhook = await this.getWebhookById(id, organizationId);

		const testPayload = {
			event: "webhook.test",
			timestamp: new Date().toISOString(),
			message: "Test webhook dispatch from UpNode incident monitoring portal.",
			webhookId: webhook.id,
			organizationId: webhook.organizationId,
		};

		const payloadString = JSON.stringify(testPayload);
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"User-Agent": "UpNode-Webhook/1.0",
			"X-UpNode-Event": "webhook.test",
		};

		if (webhook.secret) {
			const hmac = crypto
				.createHmac("sha256", webhook.secret)
				.update(payloadString)
				.digest("hex");
			headers["X-UpNode-Signature"] = `sha256=${hmac}`;
		}

		const startTime = Date.now();
		try {
			const response = await fetch(webhook.url, {
				method: "POST",
				headers,
				body: payloadString,
			});

			const responseTimeMs = Date.now() - startTime;
			const responseText = await response.text();

			return {
				success: response.ok,
				statusCode: response.status,
				responseTimeMs,
				responseBody: responseText.slice(0, 500),
			};
		} catch (err: any) {
			const responseTimeMs = Date.now() - startTime;
			return {
				success: false,
				statusCode: null,
				responseTimeMs,
				error: err.message,
			};
		}
	}
}

export const webhookService = new WebhookService();
