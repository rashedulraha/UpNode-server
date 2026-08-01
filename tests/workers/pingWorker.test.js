import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../setup";
import { pingSingleProject, processPingJob, isInMaintenance } from "../../src/workers/pingWorker";
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
        maintenanceMode: false,
        maintenanceStart: null,
        maintenanceEnd: null,
    };
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should record PingMetric with isUp = true when HTTP status is 200", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
        }));
        prismaMock.pingMetric.create.mockResolvedValue({
            id: "pm-1",
            projectId: sampleProject.id,
            url: sampleProject.url,
            statusCode: 200,
            responseTimeMs: 45,
            isUp: true,
            createdAt: new Date(),
        });
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
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            status: 500,
            ok: false,
        }));
        prismaMock.pingMetric.create.mockResolvedValue({});
        prismaMock.pingMetric.findMany.mockResolvedValue([
            { isUp: false },
            { isUp: false },
            { isUp: false },
        ]);
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
        });
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
        expect(alertQueueModule.addIncidentAlertJob).toHaveBeenCalledWith(expect.objectContaining({
            incidentId: "inc-critical-999",
            severity: "CRITICAL",
            status: "INVESTIGATING",
        }));
    });
    // ─── Maintenance Window Tests ────────────────────────────────────────────────
    it("should suppress incidents and alerts when project is in manual maintenance mode", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, ok: false }));
        prismaMock.pingMetric.create.mockResolvedValue({});
        const maintenanceProject = { ...sampleProject, maintenanceMode: true };
        const result = await pingSingleProject(maintenanceProject);
        // Ping metric still recorded
        expect(result.isUp).toBe(false);
        // But NO incident or alert
        expect(result.incidentCreated).toBe(false);
        expect(prismaMock.incident.create).not.toHaveBeenCalled();
        expect(alertQueueModule.addIncidentAlertJob).not.toHaveBeenCalled();
    });
    it("should suppress incidents during an active scheduled maintenance window", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 503, ok: false }));
        prismaMock.pingMetric.create.mockResolvedValue({});
        const now = new Date();
        const scheduledProject = {
            ...sampleProject,
            maintenanceMode: false,
            maintenanceStart: new Date(now.getTime() - 60_000), // started 1 min ago
            maintenanceEnd: new Date(now.getTime() + 60_000), // ends in 1 min
        };
        const result = await pingSingleProject(scheduledProject);
        expect(result.incidentCreated).toBe(false);
        expect(prismaMock.incident.create).not.toHaveBeenCalled();
    });
    it("isInMaintenance: returns true for manual toggle", () => {
        expect(isInMaintenance({ maintenanceMode: true, maintenanceStart: null, maintenanceEnd: null })).toBe(true);
    });
    it("isInMaintenance: returns false for elapsed scheduled window", () => {
        const now = new Date();
        expect(isInMaintenance({
            maintenanceMode: false,
            maintenanceStart: new Date(now.getTime() - 120_000),
            maintenanceEnd: new Date(now.getTime() - 60_000), // already ended
        })).toBe(false);
    });
    it("isInMaintenance: returns false when no window is set", () => {
        expect(isInMaintenance({ maintenanceMode: false, maintenanceStart: null, maintenanceEnd: null })).toBe(false);
    });
    it("should process ping job for all database projects with active URLs", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true }));
        prismaMock.project.findMany.mockResolvedValue([
            {
                id: "proj-1",
                name: "Web Portal",
                url: "https://portal.example.com",
                organizationId: "org-1",
                maintenanceMode: false,
                maintenanceStart: null,
                maintenanceEnd: null,
            },
        ]);
        prismaMock.pingMetric.create.mockResolvedValue({});
        const mockJob = { id: "cron-job-1" };
        const jobResult = await processPingJob(mockJob);
        expect(jobResult.pingedCount).toBe(1);
        expect(jobResult.upCount).toBe(1);
        expect(jobResult.downCount).toBe(0);
    });
});
