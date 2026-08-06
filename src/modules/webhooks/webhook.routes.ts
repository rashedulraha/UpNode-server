import { Router } from "express";
import { webhookController } from "./webhook.controller";
import {
	requireAuth,
	requireOrganization,
	requireRole,
} from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import {
	createWebhookSchema,
	updateWebhookSchema,
	webhookParamsSchema,
} from "./webhook.validation";

const router = Router();

router.use(requireAuth);
router.use(requireOrganization);

router.post(
	"/",
	requireRole("ADMIN", "ENGINEER"),
	validateRequest({ body: createWebhookSchema }),
	webhookController.create.bind(webhookController),
);

router.get(
	"/",
	requireRole("ADMIN", "ENGINEER", "VIEWER"),
	webhookController.getAll.bind(webhookController),
);

router.get(
	"/:id",
	requireRole("ADMIN", "ENGINEER", "VIEWER"),
	validateRequest({ params: webhookParamsSchema }),
	webhookController.getById.bind(webhookController),
);

router.patch(
	"/:id",
	requireRole("ADMIN", "ENGINEER"),
	validateRequest({ params: webhookParamsSchema, body: updateWebhookSchema }),
	webhookController.update.bind(webhookController),
);

router.delete(
	"/:id",
	requireRole("ADMIN"),
	validateRequest({ params: webhookParamsSchema }),
	webhookController.delete.bind(webhookController),
);

router.post(
	"/:id/test",
	requireRole("ADMIN", "ENGINEER"),
	validateRequest({ params: webhookParamsSchema }),
	webhookController.test.bind(webhookController),
);

export { router as webhookRoutes };
