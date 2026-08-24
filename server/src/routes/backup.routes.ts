import { Router } from "express";
import * as controller from "../controllers/backup.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { validateQuery } from "../middleware/validate";
import { backupStatusQuerySchema } from "../validation/backup.schemas";

/**
 * Phase 11 — cloud backup visibility.
 *
 * Any ACTIVE member may check that the business's data is durably persisted
 * in Atlas (counts + last-write timestamps only — no business documents are
 * returned). Shop-pinned members pass through resolveBusiness + shop access
 * like every other route.
 */
const router = Router();

router.use(requireAuth);

router.get(
  "/status",
  resolveBusiness,
  assertShopAccess,
  validateQuery(backupStatusQuerySchema),
  controller.backupStatus
);

export default router;
