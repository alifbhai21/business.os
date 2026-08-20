import { Router } from "express";
import * as controller from "../controllers/supplier.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import {
  supplierCreateSchema,
  supplierStatusSchema,
  supplierUpdateSchema,
} from "../validation/supplier.schemas";

const router = Router();

router.use(requireAuth);

router.get("/", resolveBusiness, controller.listSuppliers);
router.post(
  "/",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(supplierCreateSchema),
  controller.createSupplier
);
router.get("/:id", resolveBusiness, controller.getSupplier);
router.put(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(supplierUpdateSchema),
  controller.updateSupplier
);
router.patch(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(supplierUpdateSchema),
  controller.updateSupplier
);
router.patch(
  "/:id/status",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(supplierStatusSchema),
  controller.updateSupplierStatus
);

export default router;
