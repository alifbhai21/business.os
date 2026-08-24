import { Router } from "express";
import * as controller from "../controllers/sync.controller";
import * as backupController from "../controllers/backup.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  syncPushSchema,
  syncPullQuerySchema,
  syncStatsQuerySchema,
} from "../validation/sync.schemas";
import { restoreQuerySchema } from "../validation/backup.schemas";

const router = Router();

router.use(requireAuth);

// Push a batch of queued offline ops. Per-op RBAC/business rules are enforced
// by the dispatched services; results are per-op (SYNCED/CONFLICT/FAILED).
router.post("/push", resolveBusiness, validateBody(syncPushSchema), controller.syncPush);

// Delta pull of master data since a cursor. Any active member may read.
router.get("/pull", validateQuery(syncPullQuerySchema), controller.syncPull);

// Phase 11 — full-data restore for a NEW device. Any active member may pull;
// shop-pinned members get their own shop's transactions only (enforced in the
// service). Writes exactly one SyncEvent(RESTORE) row for observability.
router.get("/restore", validateQuery(restoreQuerySchema), backupController.restore);

// Phase 14 — sync success-rate KPI (PRD monitoring). Same visibility matrix
// as financial reports (Owner/Admin/Manager/Accountant): the numbers expose
// operational reliability, not raw business documents.
router.get(
  "/stats",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateQuery(syncStatsQuerySchema),
  controller.syncStats
);

export default router;
