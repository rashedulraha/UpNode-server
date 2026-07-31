import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../setup";
import { pingSingleProject, processPingJob } from "../../src/workers/pingWorker";
import * as alertQueueModule from "../../src/queues/alertQueue";

vi.mock("../../src/queues/alertQueue", () => ({
  addIncidentAlertJob: vi.fn().mockResolvedValue({ id: "job-alert-123" }),
}));

describe("pingWorker Uptime Monitoring & Metrics", () => {
  const sampleProject = {
    id: "proj-101",
    name: "API Gateway Service",
    url: "https://api.example.com/health",
    organizationId: "org-555",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should record PingMetric with isUp = true when HTTP status is 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
      })
    );

    prismaMock.pingMetric.create.mockResolvedValue({
      id: "pm-1",
      projectId: sampleProject.id,
      url: sampleProject.url,
      statusCode: 200,
      responseTimeMs: 45,
      isUp: true,
      createdAt: new Date(),
    } as any);

    const result = await pingSingleProject(sampleProject);

    expect(result.isUp).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.incidentCreated).toBe(false);

    expect(prismaMock.pingMetric.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: sampleProject.id,
        url: sampleProject.url,
        statusCode: 200,
        isUp: true,
      }),
    });
  });

  it("should create CRITICAL incident and trigger alert queue when HTTP status is 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
      })
    );

    prismaMock.pingMetric.create.mockResolvedValue({} as any);
    prismaMock.incident.findFirst.mockResolvedValue(null);
    prismaMock.incident.create.mockResolvedValue({
      id: "inc-critical-999",
      title: "HTTP Ping Failed: API Gateway Service (Status: 500)",
      description: "Outage detected",
      status: "INVESTIGATING",
      severity: "CRITICAL",
      version: 1,
      projectId: sampleProject.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await pingSingleProject(sampleProject);

    expect(result.isUp).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.incidentCreated).toBe(true);

    expect(prismaMock.incident.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        severity: "CRITICAL",
        status: "INVESTIGATING",
        projectId: sampleProject.id,
      }),
    });

    expect(alertQueueModule.addIncidentAlertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        incidentId: "inc-critical-999",
        severity: "CRITICAL",
        status: "INVESTIGATING",
      })
    );
  });

  it("should process ping job for all database projects with active URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
      })
    );

    prismaMock.project.findMany.mockResolvedValue([
      {
        id: "proj-1",
        name: "Web Portal",
        url: "https://portal.example.com",
        organizationId: "org-1",
      },
    ] as any);

    prismaMock.pingMetric.create.mockResolvedValue({} as any);

    const mockJob: any = { id: "cron-job-1" };
    const jobResult = await processPingJob(mockJob);

    expect(jobResult.pingedCount).toBe(1);
    expect(jobResult.upCount).toBe(1);
    expect(jobResult.downCount).toBe(0);
  });
});
