import { Router } from "express";
import * as controller from "../controllers/sale.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { saleCreateSchema, saleFinalizeSchema, saleVoidSchema, salePaymentSchema } from "../validation/sale.schemas";
import * as returnController from "../controllers/return.controller";
import { saleReturnSchema } from "../validation/inventory.schemas";

const router = Router();

router.use(requireAuth);

router.post(
  "/",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Salesperson"),
  validateBody(saleCreateSchema),
  controller.createSale
);
router.get("/", resolveBusiness, assertShopAccess, controller.listSales);
router.post(
  "/:id/return",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(saleReturnSchema),
  returnController.returnSale
);
router.get("/:id", resolveBusiness, assertShopAccess, controller.getSale);
router.post(
  "/:id/finalize",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Salesperson"),
  validateBody(saleFinalizeSchema),
  controller.finalizeSale
);
// Void/reversal (05.09) is an owner/manager action — a Salesperson who may
// record a sale must not be able to unwind a posted one.
router.post(
  "/:id/void",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(saleVoidSchema),
  controller.voidSale
);

// Settlement sub-resource (05.11). Recording money is the Payment Engine's role
// matrix (Owner/Admin/Manager/Accountant), NOT the sale-writing one — a
// Salesperson may raise an invoice but not book a receipt against it.
router.post(
  "/:id/payments",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(salePaymentSchema),
  controller.recordSalePayment
);
router.get("/:id/payments", resolveBusiness, assertShopAccess, controller.listSalePayments);

export default router;
