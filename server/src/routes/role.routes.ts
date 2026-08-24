import { Router } from "express";
import * as controller from "../controllers/employee.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { roleAssignSchema } from "../validation/team.schemas";

const router = Router();

router.use(requireAuth);

// Server-authoritative role + permission matrix (any authenticated user).
router.get("/", controller.listRoles);

// Assign a role to an employee — Owner/Admin only.
router.post(
  "/",
  resolveBusiness,
  requireRole("Owner", "Admin"),
  validateBody(roleAssignSchema),
  controller.assignRole
);

export default router;