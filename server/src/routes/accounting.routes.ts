import { Router } from "express";
import * as controller from "../controllers/accounting.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";

/**
 * Phase 07 — read-only accounting reports.
 *
 * Financial reports answer to the Accountant persona matrix (PRD §4:
 * "Accountant — books, payments, reconciliation"): Owner/Admin/Manager/
 * Accountant may read; Salesperson/Inventory Manager/Viewer may not.
 */
const router = Router();

router.use(requireAuth);
router.use(resolveBusiness, assertShopAccess);
router.use(requireRole("Owner", "Admin", "Manager", "Accountant"));

router.get("/journal", controller.listJournal);
// Phase 12 — canonical chart of accounts (registered before /:id-style paths;
// there are none here, but keep the read grouped with its siblings).
router.get("/chart", controller.chart);
router.get("/ledger", controller.generalLedger);
router.get("/trial-balance", controller.trialBalance);
router.get("/profit-loss", controller.profitLoss);
router.get("/balance-sheet", controller.balanceSheet);
router.get("/cash-flow", controller.cashFlow);

export default router;
