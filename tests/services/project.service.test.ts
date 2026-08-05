import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../setup";
import { ProjectService } from "../../src/modules/projects/project.service";

describe("ProjectService API Key Rotation", () => {
  const projectService = new ProjectService();
  const organizationId = "org-test-123";
  const projectId = "proj-uuid-111";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should rotate project API key and replace old key with new up_ prefix key", async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: projectId,
      name: "Payment Gateway",
      apiKey: "up_old_key_9999",
      organizationId,
    } as any);

    (prismaMock.project.update as any).mockImplementation((args: any) =>
      Promise.resolve({
        id: projectId,
        name: "Payment Gateway",
        apiKey: args.data.apiKey,
        organizationId,
      } as any)
    );


    const updated = await projectService.rotateApiKey(projectId, organizationId);

    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, organizationId },
      include: expect.any(Object),
    });

    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: projectId },
      data: { apiKey: expect.stringMatching(/^up_[a-f0-9]{32}$/) },
    });

    expect(updated.apiKey).not.toBe("up_old_key_9999");
    expect(updated.apiKey).toMatch(/^up_[a-f0-9]{32}$/);
  });

  it("should allow rotating with custom API key when supplied", async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: projectId,
      name: "Payment Gateway",
      apiKey: "up_old_key_9999",
      organizationId,
    } as any);

    prismaMock.project.update.mockResolvedValue({
      id: projectId,
      name: "Payment Gateway",
      apiKey: "upnode_custom_secret_key_123",
      organizationId,
    } as any);

    const updated = await projectService.rotateApiKey(projectId, organizationId, "upnode_custom_secret_key_123");

    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: projectId },
      data: { apiKey: "upnode_custom_secret_key_123" },
    });

    expect(updated.apiKey).toBe("upnode_custom_secret_key_123");
  });

  it("should throw NotFoundError if project does not belong to organization", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);

    await expect(
      projectService.rotateApiKey("non-existent-id", organizationId)
    ).rejects.toThrow("not found in your organization");
  });
});
