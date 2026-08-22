import { Router } from "express";
import * as controller from "../controllers/inventory.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { adjustStockSchema, openingStockSchema } from "../validation/inventory.schemas";

const router = Router();

router.use(requireAuth);

router.get("/stock", resolveBusiness, assertShopAccess, controller.listStock);
router.get("/movements", resolveBusiness, assertShopAccess, controller.listMovements);
router.post(
  "/adjust",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(adjustStockSchema),
  controller.adjustStock
);
router.post(
  "/opening",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(openingStockSchema),
  controller.setOpeningStock
);

export default router;