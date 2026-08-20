import { Router } from "express";
import * as controller from "../controllers/customer.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import {
  customerCreateSchema,
  customerStatusSchema,
  customerUpdateSchema,
} from "../validation/customer.schemas";

const router = Router();

router.use(requireAuth);

router.get("/", resolveBusiness, controller.listCustomers);
router.post(
  "/",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Accountant", "Salesperson"),
  validateBody(customerCreateSchema),
  controller.createCustomer
);
router.get("/:id", resolveBusiness, controller.getCustomer);
router.put(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Accountant", "Salesperson"),
  validateBody(customerUpdateSchema),
  controller.updateCustomer
);
router.patch(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Accountant", "Salesperson"),
  validateBody(customerUpdateSchema),
  controller.updateCustomer
);
router.patch(
  "/:id/status",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Accountant", "Salesperson"),
  validateBody(customerStatusSchema),
  controller.updateCustomerStatus
);

export default router;
