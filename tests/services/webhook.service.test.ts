import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../setup";
import { webhookService } from "../../src/modules/webhooks/webhook.service";

describe("WebhookService", () => {
  const orgId = "org-123";

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"status":"received"}',
      })
    );
  });

  it("should create a new webhook endpoint", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: "proj-1", organizationId: orgId } as any);
    prismaMock.webhook.create.mockResolvedValue({
      id: "wh-1",
      url: "https://myapi.com/webhook",
      secret: "mysecret",
      events: ["incident.created", "incident.resolved"],
      enabled: true,
      organizationId: orgId,
      projectId: "proj-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await webhookService.createWebhook(
      {
        url: "https://myapi.com/webhook",
        secret: "mysecret",
        projectId: "proj-1",
      },
      orgId
    );

    expect(prismaMock.webhook.create).toHaveBeenCalled();
    expect(result.id).toBe("wh-1");
    expect(result.url).toBe("https://myapi.com/webhook");
  });

  it("should retrieve webhooks for organization", async () => {
    prismaMock.webhook.findMany.mockResolvedValue([
      { id: "wh-1", url: "https://myapi.com/webhook" },
    ] as any);

    const result = await webhookService.getWebhooks(orgId);

    expect(prismaMock.webhook.findMany).toHaveBeenCalledWith({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { id: true, name: true } } },
    });
    expect(result.length).toBe(1);
  });

  it("should test dispatching to a webhook endpoint", async () => {
    prismaMock.webhook.findFirst.mockResolvedValue({
      id: "wh-1",
      url: "https://myapi.com/webhook",
      secret: "secret123",
      organizationId: orgId,
    } as any);

    const result = await webhookService.testWebhook("wh-1", orgId);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseBody).toBe('{"status":"received"}');
  });

  it("should delete a webhook endpoint", async () => {
    prismaMock.webhook.findFirst.mockResolvedValue({
      id: "wh-1",
      organizationId: orgId,
    } as any);
    prismaMock.webhook.delete.mockResolvedValue({ id: "wh-1" } as any);

    const result = await webhookService.deleteWebhook("wh-1", orgId);

    expect(prismaMock.webhook.delete).toHaveBeenCalledWith({ where: { id: "wh-1" } });
    expect(result.success).toBe(true);
  });
});
