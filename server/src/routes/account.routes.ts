import { Router } from "express";
import * as controller from "../controllers/account.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { accountCreateSchema, accountUpdateSchema } from "../validation/account.schemas";

const router = Router();

router.use(requireAuth);

router.get("/", resolveBusiness, assertShopAccess, controller.listAccounts);
router.post(
  "/",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(accountCreateSchema),
  controller.createAccount
);
router.get("/:id", resolveBusiness, assertShopAccess, controller.getAccount);
router.put(
  "/:id",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(accountUpdateSchema),
  controller.updateAccount
);
router.patch(
  "/:id",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Accountant"),
  validateBody(accountUpdateSchema),
  controller.updateAccount
);

export default router;