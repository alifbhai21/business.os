import { Router } from "express";
import * as controller from "../controllers/payment.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { paymentCreateSchema } from "../validation/payment.schemas";

const router = Router();

router.use(requireAuth);

router.post(
  "/",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(paymentCreateSchema),
  controller.createPayment
);
router.get("/", resolveBusiness, assertShopAccess, controller.listPayments);
router.get("/:id", resolveBusiness, assertShopAccess, controller.getPayment);

export default router;