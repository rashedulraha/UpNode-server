import { Worker, Job } from "bullmq";
import { redisConnectionOptions } from "../lib/redis";
import { ALERT_QUEUE_NAME, IncidentAlertPayload } from "../queues/alertQueue";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Send real-time Slack Webhook notification for an incident alert
 */
export const sendSlackNotification = async (payload: IncidentAlertPayload): Promise<boolean> => {
  const { incidentId, title, description, severity, status, projectId, organizationId, createdAt } = payload;

  const severityEmoji: Record<string, string> = {
    CRITICAL: "🔴 CRITICAL",
    HIGH: "🟠 HIGH",
    MEDIUM: "🟡 MEDIUM",
    LOW: "🔵 LOW",
  };

  const severityFormatted = severityEmoji[severity] || severity;

  const slackPayload = {
    text: `🚨 [${severity}] UpNode Incident Alert: ${title}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🚨 Incident Alert: ${title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Severity:*\n${severityFormatted}`,
          },
          {
            type: "mrkdwn",
            text: `*Status:*\n\`${status}\``,
          },
          {
            type: "mrkdwn",
            text: `*Project ID:*\n\`${projectId}\``,
          },
          {
            type: "mrkdwn",
            text: `*Organization ID:*\n\`${organizationId}\``,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Description:*\n${description || "No description provided."}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Incident ID: \`${incidentId}\` | Reported: ${createdAt}`,
          },
        ],
      },
    ],
  };

  if (env.SLACK_WEBHOOK_URL) {
    try {
      const response = await fetch(env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack Webhook API responded with status ${response.status}: ${errorText}`);
      }

      logger.info(`[Slack Alert] Successfully dispatched Slack notification for incident ${incidentId}`);
      return true;
    } catch (err: any) {
      logger.error(`[Slack Alert Error] Failed to send Slack notification for incident ${incidentId}: ${err.message}`);
      throw err;
    }
  } else {
    // Simulated fallback log when SLACK_WEBHOOK_URL is not set
    console.log(
      `[Slack Notification Simulated] 🚨 [${severity}] ${title} | Status: ${status} | Org: ${organizationId} | Project: ${projectId}`
    );
    return true;
  }
};

/**
 * Fetch organization team members from Prisma database and send email alerts
 */
export const sendEmailNotification = async (payload: IncidentAlertPayload): Promise<{ count: number; recipients: string[] }> => {
  const { incidentId, title, description, severity, status, organizationId, createdAt } = payload;

  // Query organization members and their user email profiles using Prisma
  const members = await prisma.member.findMany({
    where: { organizationId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const recipientEmails = members
    .map((m) => m.user?.email)
    .filter((email): email is string => Boolean(email && email.includes("@")));

  if (recipientEmails.length === 0) {
    logger.warn(`[Email Alert] No team members found for organization ${organizationId}. Skipping email dispatch.`);
    return { count: 0, recipients: [] };
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
      <h2 style="color: #e53e3e; margin-top: 0;">🚨 UpNode Incident Alert: ${title}</h2>
      <p style="color: #4a5568; font-size: 14px;">A new incident has been reported for your organization team.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold; color: #2d3748;">Severity:</td>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7; color: #c53030; font-weight: bold;">${severity}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold; color: #2d3748;">Status:</td>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7; color: #2b6cb0;">${status}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold; color: #2d3748;">Incident ID:</td>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7; color: #4a5568; font-family: monospace;">${incidentId}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold; color: #2d3748;">Reported Time:</td>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7; color: #4a5568;">${createdAt}</td>
        </tr>
      </table>

      <div style="background-color: #f7fafc; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
        <h4 style="margin-top: 0; color: #2d3748;">Description:</h4>
        <p style="color: #4a5568; margin-bottom: 0; font-size: 14px;">${description || "No detailed description provided."}</p>
      </div>

      <p style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 30px;">
        UpNode Real-Time Telemetry & Incident Management Platform
      </p>
    </div>
  `;

  if (env.RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: recipientEmails,
          subject: `[${severity}] UpNode Incident Alert: ${title}`,
          html: htmlContent,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend Email API responded with status ${response.status}: ${errorText}`);
      }

      logger.info(`[Email Alert] Sent alert email via Resend to ${recipientEmails.length} recipients for incident ${incidentId}`);
      return { count: recipientEmails.length, recipients: recipientEmails };
    } catch (err: any) {
      logger.error(`[Email Alert Error] Failed to send email via Resend: ${err.message}`);
      throw err;
    }
  } else {
    // Simulated fallback log when RESEND_API_KEY is not set
    console.log(
      `[Email Notification Simulated] ✉️ Sent incident alert email to ${recipientEmails.length} team members: ${recipientEmails.join(", ")}`
    );
    return { count: recipientEmails.length, recipients: recipientEmails };
  }
};

export const processAlertJob = async (job: Job<IncidentAlertPayload>) => {
  const { incidentId } = job.data;
  console.log(`[Worker] Processing Job #${job.id} (Attempt ${job.attemptsMade + 1}): Alert for Incident ${incidentId}`);

  const [slackResult, emailResult] = await Promise.allSettled([
    sendSlackNotification(job.data),
    sendEmailNotification(job.data),
  ]);

  const slackSuccess = slackResult.status === "fulfilled" && slackResult.value === true;
  const emailData = emailResult.status === "fulfilled" ? emailResult.value : { count: 0, recipients: [] };

  if (slackResult.status === "rejected") {
    console.error(`[Worker Job #${job.id}] Slack dispatch rejected:`, slackResult.reason?.message || slackResult.reason);
  }

  if (emailResult.status === "rejected") {
    console.error(`[Worker Job #${job.id}] Email dispatch rejected:`, emailResult.reason?.message || emailResult.reason);
  }

  return {
    sentSlack: slackSuccess,
    sentEmailCount: emailData.count,
    recipients: emailData.recipients,
    timestamp: new Date().toISOString(),
  };
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
