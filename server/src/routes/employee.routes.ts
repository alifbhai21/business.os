import { Router } from "express";
import * as controller from "../controllers/employee.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  employeeCreateSchema,
  employeeUpdateSchema,
  employeeListQuerySchema,
} from "../validation/team.schemas";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  validateQuery(employeeListQuerySchema),
  controller.listEmployees
);
router.post(
  "/",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(employeeCreateSchema),
  controller.createEmployee
);
router.put(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(employeeUpdateSchema),
  controller.updateEmployee
);
// Soft-remove (never hard delete — audit trail).
router.delete(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(employeeUpdateSchema.pick({ businessId: true })),
  controller.removeEmployee
);

export default router;