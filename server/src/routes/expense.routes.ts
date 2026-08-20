import { Router } from "express";
import * as controller from "../controllers/expense.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { expenseCreateSchema } from "../validation/expense.schemas";

const router = Router();

router.use(requireAuth);

router.post(
  "/",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(expenseCreateSchema),
  controller.createExpense
);
router.get("/", resolveBusiness, assertShopAccess, controller.listExpenses);
router.get("/:id", resolveBusiness, assertShopAccess, controller.getExpense);

export default router;
