import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../setup";
import { projectService } from "../../src/modules/projects/project.service";
describe("Public Status Page API Service", () => {
    const sampleProject = {
        id: "proj-status-123",
        name: "Payments Service",
        slug: "payments-service",
        url: "https://payments.example.com/health",
        apiKey: "up_key_123",
        organizationId: "org-test-1",
    };
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    it("should return OPERATIONAL status when there are no active incidents and pings are up", async () => {
        prismaMock.project.findFirst.mockResolvedValue(sampleProject);
        prismaMock.incident.findMany.mockResolvedValueOnce([]); // activeIncidents
        prismaMock.incident.findMany.mockResolvedValueOnce([]); // past7DaysIncidents
        prismaMock.pingMetric.findMany.mockResolvedValue([
            {
                id: "pm-1",
                projectId: sampleProject.id,
                url: sampleProject.url,
                statusCode: 200,
                responseTimeMs: 32,
                isUp: true,
                createdAt: new Date(),
            },
        ]);
        const statusData = await projectService.getPublicProjectStatus("payments-service");
        expect(statusData.project.name).toBe("Payments Service");
        expect(statusData.systemStatus).toBe("OPERATIONAL");
        expect(statusData.uptimePercentage).toBe(100);
        expect(statusData.avgLatencyMs).toBe(32);
        expect(statusData.activeIncidents).toEqual([]);
    });
    it("should return MAJOR_OUTAGE status when a CRITICAL active incident exists", async () => {
        prismaMock.project.findFirst.mockResolvedValue(sampleProject);
        prismaMock.incident.findMany.mockResolvedValueOnce([
            {
                id: "inc-1",
                title: "API Gateway Down",
                severity: "CRITICAL",
                status: "INVESTIGATING",
                timelineEvents: [],
            },
        ]);
        prismaMock.incident.findMany.mockResolvedValueOnce([]);
        prismaMock.pingMetric.findMany.mockResolvedValue([]);
        const statusData = await projectService.getPublicProjectStatus("payments-service");
        expect(statusData.systemStatus).toBe("MAJOR_OUTAGE");
        expect(statusData.activeIncidents).toHaveLength(1);
    });
    it("should throw NotFoundError if project is not found", async () => {
        prismaMock.project.findFirst.mockResolvedValue(null);
        await expect(projectService.getPublicProjectStatus("non-existent-slug")).rejects.toThrow("Public status page for 'non-existent-slug' was not found");
    });
});
