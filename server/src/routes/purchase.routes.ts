import { Router } from "express";
import * as controller from "../controllers/purchase.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { purchaseCreateSchema, purchaseFinalizeSchema } from "../validation/purchase.schemas";

const router = Router();

router.use(requireAuth);

router.post(
  "/",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(purchaseCreateSchema),
  controller.createPurchase
);
router.get("/", resolveBusiness, assertShopAccess, controller.listPurchases);
router.get("/:id", resolveBusiness, assertShopAccess, controller.getPurchase);
router.post(
  "/:id/finalize",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(purchaseFinalizeSchema),
  controller.finalizePurchase
);

export default router;
