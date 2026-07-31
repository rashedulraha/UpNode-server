import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../setup";
import {
  sendSlackNotification,
  sendEmailNotification,
  processAlertJob,
} from "../../src/workers/alertWorker";
import { IncidentAlertPayload } from "../../src/queues/alertQueue";

describe("alertWorker Notification Logic", () => {
  const samplePayload: IncidentAlertPayload = {
    incidentId: "inc-123",
    title: "Database Latency Spike",
    description: "Postgres query latency exceeded 2500ms threshold.",
    severity: "CRITICAL",
    status: "INVESTIGATING",
    projectId: "proj-456",
    organizationId: "org-789",
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should send simulated Slack notification when SLACK_WEBHOOK_URL is not provided", async () => {
    const result = await sendSlackNotification(samplePayload);
    expect(result).toBe(true);
  });

  it("should query organization members and format email notifications", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      {
        id: "mem-1",
        role: "ADMIN",
        organizationId: "org-789",
        userId: "usr-1",
        user: {
          id: "usr-1",
          name: "Alice Engineer",
          email: "alice@company.com",
        },
      },
      {
        id: "mem-2",
        role: "ENGINEER",
        organizationId: "org-789",
        userId: "usr-2",
        user: {
          id: "usr-2",
          name: "Bob SRE",
          email: "bob@company.com",
        },
      },
    ] as any);

    const result = await sendEmailNotification(samplePayload);

    expect(prismaMock.member.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-789" },
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

    expect(result.count).toBe(2);
    expect(result.recipients).toEqual(["alice@company.com", "bob@company.com"]);
  });

  it("should process alert job successfully running Slack and Email dispatches", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      {
        id: "mem-1",
        role: "ADMIN",
        organizationId: "org-789",
        userId: "usr-1",
        user: {
          id: "usr-1",
          name: "Alice Engineer",
          email: "alice@company.com",
        },
      },
    ] as any);

    const mockJob: any = {
      id: "job-001",
      attemptsMade: 0,
      data: samplePayload,
    };

    const result = await processAlertJob(mockJob);

    expect(result.sentSlack).toBe(true);
    expect(result.sentEmailCount).toBe(1);
    expect(result.recipients).toEqual(["alice@company.com"]);
    expect(result.timestamp).toBeDefined();
  });
});
