import { Router } from "express";
import * as controller from "../controllers/dashboard.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";

/**
 * Phase 08 - owner dashboard.
 *
 * The dashboard surfaces financial truth (profit, receivables, payables,
 * cash), so it answers to the same persona matrix as the Phase 07
 * accounting reports (PRD A7): Owner/Admin/Manager/Accountant may read;
 * Salesperson/Inventory Manager/Viewer may not.
 */
const router = Router();

router.use(requireAuth);
router.use(resolveBusiness, assertShopAccess);
router.use(requireRole("Owner", "Admin", "Manager", "Accountant"));

router.get("/", controller.getDashboard);

export default router;
