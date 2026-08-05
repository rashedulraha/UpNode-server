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

  // 1. Fetch project & organization integration settings from database
  let targetSlackWebhookUrl: string | null = null;
  let projectName = projectId;
  let organizationName = organizationId;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { organization: true },
    });

    if (project) {
      projectName = project.name;
      organizationName = project.organization.name;
      targetSlackWebhookUrl = project.slackWebhookUrl || project.organization.slackWebhookUrl || env.SLACK_WEBHOOK_URL || null;
    }
  } catch (err: any) {
    logger.warn(`[Slack Alert] Failed to fetch project database settings for ${projectId}: ${err.message}`);
  }

  if (!targetSlackWebhookUrl) {
    targetSlackWebhookUrl = env.SLACK_WEBHOOK_URL || null;
  }

  const severityEmoji: Record<string, string> = {
    CRITICAL: "🔴 CRITICAL",
    HIGH: "🟠 HIGH",
    MEDIUM: "🟡 MEDIUM",
    LOW: "🔵 LOW",
  };

  const severityFormatted = severityEmoji[severity] || severity;

  // Rich block-formatted Slack payload for #incidents channel
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
            text: `*Project:*\n*${projectName}*`,
          },
          {
            type: "mrkdwn",
            text: `*Organization:*\n*${organizationName}*`,
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
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Incident ID: \`${incidentId}\` | Reported: ${createdAt} | UpNode Incident Engine`,
          },
        ],
      },
    ],
  };

  if (targetSlackWebhookUrl) {
    try {
      const response = await fetch(targetSlackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack Webhook API responded with status ${response.status}: ${errorText}`);
      }

      logger.info({
        event: "SLACK_ALERT_DISPATCHED",
        incidentId,
        severity,
        projectName,
      }, `[Slack Alert] Successfully dispatched Slack notification for incident ${incidentId}`);
      return true;
    } catch (err: any) {
      logger.error({
        event: "SLACK_ALERT_ERROR",
        incidentId,
        error: err.message,
      }, `[Slack Alert Error] Failed to send Slack notification for incident ${incidentId}: ${err.message}`);
      throw err;
    }
  } else {
    // Simulated fallback log when no Slack Webhook URL is configured
    logger.info({
      event: "SLACK_ALERT_SIMULATED",
      incidentId,
      severity,
      title,
      status,
      organizationName,
      projectName,
    }, `[Slack Notification Simulated] 🚨 [${severity}] ${title} | Status: ${status} | Org: ${organizationName} | Project: ${projectName}`);
    return true;
  }
};

/**
 * Fetch organization team members & alert settings from Prisma database and send transactional email alerts
 */
export const sendEmailNotification = async (payload: IncidentAlertPayload): Promise<{ count: number; recipients: string[] }> => {
  const { incidentId, title, description, severity, status, projectId, organizationId, createdAt } = payload;

  const recipientEmailsSet = new Set<string>();

  // 1. Fetch project & organization alert email configurations
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { organization: true },
    });

    if (project?.alertEmail) {
      project.alertEmail.split(/[,;\s]+/).forEach((e) => {
        if (e && e.includes("@")) recipientEmailsSet.add(e.trim().toLowerCase());
      });
    }

    if (project?.organization?.alertEmail) {
      project.organization.alertEmail.split(/[,;\s]+/).forEach((e) => {
        if (e && e.includes("@")) recipientEmailsSet.add(e.trim().toLowerCase());
      });
    }
  } catch {
    // Ignore error, fallback to members query
  }

  // 2. Query organization members and their user email profiles using Prisma
  try {
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

    members.forEach((m) => {
      if (m.user?.email && m.user.email.includes("@")) {
        recipientEmailsSet.add(m.user.email.trim().toLowerCase());
      }
    });
  } catch (err: any) {
    logger.warn(`[Email Alert] Failed to query member emails for organization ${organizationId}: ${err.message}`);
  }

  const recipientEmails = Array.from(recipientEmailsSet);

  if (recipientEmails.length === 0) {
    logger.warn(`[Email Alert] No alert email recipients found for organization ${organizationId}. Skipping email dispatch.`);
    return { count: 0, recipients: [] };
  }

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="background-color: #fff5f5; border-left: 4px solid #e53e3e; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
        <h2 style="color: #c53030; margin: 0 0 6px 0; font-size: 18px;">🚨 UpNode Incident Alert</h2>
        <h3 style="color: #2d3748; margin: 0; font-size: 16px;">${title}</h3>
      </div>
      
      <p style="color: #4a5568; font-size: 14px; line-height: 1.5;">A new operational incident has been triggered on your monitored infrastructure.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; font-weight: 600; color: #4a5568; width: 30%;">Severity:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; color: #c53030; font-weight: 700;">${severity}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; font-weight: 600; color: #4a5568;">Status:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; color: #2b6cb0; font-weight: 600;">${status}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; font-weight: 600; color: #4a5568;">Incident ID:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; color: #4a5568; font-family: monospace;">${incidentId}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; font-weight: 600; color: #4a5568;">Reported Time:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; color: #4a5568;">${createdAt}</td>
        </tr>
      </table>

      <div style="background-color: #f7fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #edf2f7;">
        <h4 style="margin: 0 0 8px 0; color: #2d3748; font-size: 14px;">Details:</h4>
        <p style="color: #4a5568; margin: 0; font-size: 14px; line-height: 1.5;">${description || "No detailed description provided."}</p>
      </div>

      <p style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 28px; border-t: 1px solid #edf2f7; padding-top: 16px;">
        UpNode Real-Time Telemetry &amp; Incident Management Engine
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
          from: env.EMAIL_FROM || "alerts@upnode.io",
          to: recipientEmails,
          subject: `[${severity}] UpNode Incident Alert: ${title}`,
          html: htmlContent,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend Email API responded with status ${response.status}: ${errorText}`);
      }

      logger.info({
        event: "EMAIL_ALERT_DISPATCHED",
        incidentId,
        recipientCount: recipientEmails.length,
      }, `[Email Alert] Sent alert email via Resend to ${recipientEmails.length} recipients for incident ${incidentId}`);
      return { count: recipientEmails.length, recipients: recipientEmails };
    } catch (err: any) {
      logger.error({
        event: "EMAIL_ALERT_ERROR",
        incidentId,
        error: err.message,
      }, `[Email Alert Error] Failed to send email via Resend: ${err.message}`);
      throw err;
    }
  } else {
    // Simulated fallback log when RESEND_API_KEY is not set
    logger.info({
      event: "EMAIL_ALERT_SIMULATED",
      incidentId,
      recipientCount: recipientEmails.length,
      recipients: recipientEmails,
    }, `[Email Notification Simulated] ✉️ Sent incident alert email to ${recipientEmails.length} recipients: ${recipientEmails.join(", ")}`);
    return { count: recipientEmails.length, recipients: recipientEmails };
  }
};

export const processAlertJob = async (job: Job<IncidentAlertPayload>) => {
  const { incidentId } = job.data;
  logger.info({
    event: "ALERT_JOB_PROCESSING",
    jobId: job.id,
    attempt: job.attemptsMade + 1,
    incidentId,
  }, `[Alert Worker] Processing Job #${job.id} (Attempt ${job.attemptsMade + 1}): Alert for Incident ${incidentId}`);

  const [slackResult, emailResult] = await Promise.allSettled([
    sendSlackNotification(job.data),
    sendEmailNotification(job.data),
  ]);

  const slackSuccess = slackResult.status === "fulfilled" && slackResult.value === true;
  const emailData = emailResult.status === "fulfilled" ? emailResult.value : { count: 0, recipients: [] };

  if (slackResult.status === "rejected") {
    logger.error({
      event: "SLACK_DISPATCH_REJECTED",
      jobId: job.id,
      error: slackResult.reason?.message || slackResult.reason,
    }, `[Alert Worker Job #${job.id}] Slack dispatch rejected: ${slackResult.reason?.message || slackResult.reason}`);
  }

  if (emailResult.status === "rejected") {
    logger.error({
      event: "EMAIL_DISPATCH_REJECTED",
      jobId: job.id,
      error: emailResult.reason?.message || emailResult.reason,
    }, `[Alert Worker Job #${job.id}] Email dispatch rejected: ${emailResult.reason?.message || emailResult.reason}`);
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
    logger.info({
      event: "ALERT_JOB_COMPLETED",
      jobId: job.id,
      result,
    }, `[Alert Worker] Job #${job.id} completed successfully`);
  });

  worker.on("failed", (job: Job<IncidentAlertPayload> | undefined, err: Error) => {
    if (job) {
      logger.error({
        event: "ALERT_JOB_FAILED",
        jobId: job.id,
        attempt: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        error: err.message,
      }, `[Alert Worker] Job #${job.id} failed (Attempt ${job.attemptsMade}/${job.opts.attempts}). Error: ${err.message}`);
    } else {
      logger.error({ event: "ALERT_JOB_FAILED", error: err.message }, `[Alert Worker] Unknown job failed: ${err.message}`);
    }
  });

  worker.on("error", (err: Error) => {
    logger.error({ event: "ALERT_WORKER_ERROR", error: err.message }, `[Alert Worker] Unexpected worker error: ${err.message}`);
  });

  logger.info(`[Alert Worker] Alert worker started listening on queue: ${ALERT_QUEUE_NAME}`);
  return worker;
};
