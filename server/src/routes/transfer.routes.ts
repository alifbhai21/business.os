import { Router } from "express";
import * as controller from "../controllers/transfer.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { createTransferSchema, updateTransferStatusSchema } from "../validation/inventory.schemas";

const router = Router();

router.use(requireAuth);

router.post(
  "/",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(createTransferSchema),
  controller.createTransfer
);
router.get("/", resolveBusiness, assertShopAccess, controller.listTransfers);
router.put(
  "/:id/status",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(updateTransferStatusSchema),
  controller.updateTransferStatus
);

export default router;