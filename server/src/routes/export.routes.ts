import { Router } from "express";
import * as controller from "../controllers/export.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { validateQuery } from "../middleware/validate";
import {
  exportCsvQuerySchema,
  exportDataQuerySchema,
} from "../validation/backup.schemas";

/**
 * Phase 11 — data export (JSON archive + per-entity CSV).
 *
 * Exports contain the ENTIRE business dataset including journals and audit
 * trail, so they answer to the `data:export` permission (Owner/Admin/
 * Manager/Accountant) at route level AND inside the service.
 */
const router = Router();

router.use(requireAuth);
router.use(resolveBusiness, assertShopAccess);
router.use(requirePermission("data:export"));

router.get("/data", validateQuery(exportDataQuerySchema), controller.exportJson);
router.get("/csv", validateQuery(exportCsvQuerySchema), controller.exportCsv);
// Phase 12 — real .xlsx workbook of the same projection (same permission).
router.get("/excel", validateQuery(exportCsvQuerySchema), controller.exportExcel);

export default router;
