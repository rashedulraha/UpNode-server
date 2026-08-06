import { Queue } from "bullmq";
import { redisConnectionOptions } from "../lib/redis";

export const ALERT_QUEUE_NAME = "incident-alerts";

export interface IncidentAlertPayload {
	incidentId: string;
	title: string;
	description: string;
	severity: string;
	status: string;
	projectId: string;
	organizationId: string;
	createdAt: string;
}

export const alertQueue = new Queue<IncidentAlertPayload>(ALERT_QUEUE_NAME, {
	connection: redisConnectionOptions,
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: "exponential",
			delay: 1000, // 1s, 2s, 4s...
		},
		removeOnComplete: true,
		removeOnFail: false,
	},
});

import { logger } from "../lib/logger";

export const addIncidentAlertJob = async (payload: IncidentAlertPayload) => {
	try {
		const job = await alertQueue.add("send-alert", payload);
		logger.info(
			{
				event: "ALERT_JOB_ENQUEUED",
				jobId: job.id,
				incidentId: payload.incidentId,
			},
			`[Queue] Added alert job #${job.id} for incident: ${payload.incidentId}`,
		);
		return job;
	} catch (error: any) {
		logger.error(
			{
				event: "ALERT_JOB_ENQUEUE_ERROR",
				incidentId: payload.incidentId,
				error: error.message,
			},
			`[Queue] Failed to add alert job: ${error.message}`,
		);
	}
};
