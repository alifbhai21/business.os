import { Router } from "express";
import * as controller from "../controllers/report.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";

/**
 * Phase 08 - read-only business reports.
 *
 * Same persona matrix as the Phase 07 accounting reads: every report
 * exposes financial truth, so Owner/Admin/Manager/Accountant may read;
 * Salesperson/Inventory Manager/Viewer may not. Services re-check the
 * membership (defense in depth).
 */
const router = Router();

router.use(requireAuth);
router.use(resolveBusiness, assertShopAccess);
router.use(requireRole("Owner", "Admin", "Manager", "Accountant"));

router.get("/sales", controller.sales);
router.get("/purchases", controller.purchases);
router.get("/inventory", controller.inventory);
router.get("/profit-loss", controller.profitLoss);
router.get("/receivables", controller.receivables);
router.get("/payables", controller.payables);
router.get("/expenses", controller.expenses);

export default router;
