import { Router } from "express";
import * as controller from "../controllers/notification.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  markAllReadSchema,
  notificationListQuerySchema,
  preferenceUpdateSchema,
} from "../validation/notification.schemas";

/**
 * Phase 12 — in-app notifications. Operational alerts are visible to every
 * ACTIVE member of the business (shop-pinned members see their shop's rows
 * plus business-wide alerts). Preferences are per user.
 */
const router = Router();

router.use(requireAuth);

router.get("/", resolveBusiness, assertShopAccess, validateQuery(notificationListQuerySchema), controller.list);
router.post(
  "/:id/read",
  resolveBusiness,
  assertShopAccess,
  validateBody(markAllReadSchema),
  controller.markRead
);
router.post(
  "/read-all",
  resolveBusiness,
  assertShopAccess,
  validateBody(markAllReadSchema),
  controller.markAllRead
);
router.get("/preferences", resolveBusiness, assertShopAccess, controller.getPreferences);
router.put(
  "/preferences",
  resolveBusiness,
  assertShopAccess,
  validateBody(preferenceUpdateSchema),
  controller.updatePreferences
);

export default router;
