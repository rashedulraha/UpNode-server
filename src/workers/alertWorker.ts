import { Worker, Job } from "bullmq";
import { redisConnectionOptions } from "../lib/redis";
import { ALERT_QUEUE_NAME, IncidentAlertPayload } from "../queues/alertQueue";

const processAlertJob = async (job: Job<IncidentAlertPayload>) => {
  const { incidentId, title, severity, status, projectId, organizationId } = job.data;
  console.log(`[Worker] Processing Job #${job.id} (Attempt ${job.attemptsMade + 1}): Alert for Incident ${incidentId}`);

  // Simulate Slack Notification
  console.log(`[Slack Notification] 🚨 [${severity}] ${title} | Status: ${status} | Org: ${organizationId} | Project: ${projectId}`);
  await new Promise((resolve) => setTimeout(resolve, 300)); // Simulate async network call

  // Simulate Email Notification
  console.log(`[Email Notification] ✉️ Sending incident alert email to organization team members for incident: "${title}"`);
  await new Promise((resolve) => setTimeout(resolve, 200));

  return { sentSlack: true, sentEmail: true, timestamp: new Date().toISOString() };
};

export const startAlertWorker = () => {
  const worker = new Worker<IncidentAlertPayload>(ALERT_QUEUE_NAME, processAlertJob, {
    connection: redisConnectionOptions,
    concurrency: 5,
  });

  worker.on("completed", (job: Job<IncidentAlertPayload>, result) => {
    console.log(`[Worker] Job #${job.id} completed successfully:`, result);
  });

  worker.on("failed", (job: Job<IncidentAlertPayload> | undefined, err: Error) => {
    if (job) {
      console.error(
        `[Worker] Job #${job.id} failed (Attempt ${job.attemptsMade}/${job.opts.attempts}). Error: ${err.message}`
      );
    } else {
      console.error(`[Worker] Unknown job failed: ${err.message}`);
    }
  });

  worker.on("error", (err: Error) => {
    console.error("[Worker] Unexpected worker error:", err.message);
  });

  console.log(`[Worker] Alert worker started listening on queue: ${ALERT_QUEUE_NAME}`);
  return worker;
};
