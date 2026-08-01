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
 * Schedule repeatable job every 30 seconds to ping all project URLs
 */
export const setupCronPingJob = async () => {
  try {
    // Add repeatable job scheduled every 30 seconds (every: 30000ms)
    await pingQueue.add(
      "scheduled-project-ping",
      {},
      {
        repeat: {
          every: 30000, // Every 30 seconds interval
        },
        jobId: "thirty-second-project-ping-job",
      } as any
    );
    logger.info(`[Ping Queue] Successfully registered 30-second repeatable ping job (every 30s)`);
  } catch (error: any) {
    logger.error(`[Ping Queue Error] Failed to schedule 30-second repeatable ping job: ${error.message}`);
  }
};
