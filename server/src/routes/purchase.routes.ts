import { Router } from "express";
import * as controller from "../controllers/purchase.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import {
  purchaseCreateSchema,
  purchaseFinalizeSchema,
  purchaseVoidSchema,
  purchasePaymentSchema,
} from "../validation/purchase.schemas";

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
// Void/reversal (05.09) — Inventory Manager may RECORD a purchase but not
// unwind a posted one.
router.post(
  "/:id/void",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(purchaseVoidSchema),
  controller.voidPurchase
);

// Settlement sub-resource (05.11). Paying a supplier is the Payment Engine's
// role matrix (Owner/Admin/Manager/Accountant) — an Inventory Manager may
// receive goods but not release money.
router.post(
  "/:id/payments",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(purchasePaymentSchema),
  controller.recordPurchasePayment
);
router.get("/:id/payments", resolveBusiness, assertShopAccess, controller.listPurchasePayments);

export default router;
