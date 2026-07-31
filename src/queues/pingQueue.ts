import { Queue } from "bullmq";
import { redisConnectionOptions } from "../lib/redis";
import { logger } from "../lib/logger";

export const PING_QUEUE_NAME = "project-uptime-pings";

export const pingQueue = new Queue(PING_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 50, // Keep last 50 completed ping jobs
    removeOnFail: 100,
  },
});

/**
 * Schedule repeatable cron job every 5 minutes to ping all project URLs
 */
export const setupCronPingJob = async () => {
  try {
    // Add repeatable job scheduled every 5 minutes
    await pingQueue.add(
      "scheduled-project-ping",
      {},
      {
        repeat: {
          pattern: "*/5 * * * *", // Every 5 minutes cron pattern
        },
        jobId: "five-minute-project-ping-job",
      }
    );
    logger.info(`[Ping Queue] Successfully registered 5-minute cron ping job (*/5 * * * *)`);
  } catch (error: any) {
    logger.error(`[Ping Queue Error] Failed to schedule 5-minute cron ping job: ${error.message}`);
  }
};
