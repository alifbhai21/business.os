import { Router } from "express";
import * as controller from "../controllers/sale.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { saleCreateSchema, saleFinalizeSchema } from "../validation/sale.schemas";

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
router.get("/:id", resolveBusiness, assertShopAccess, controller.getSale);
router.post(
  "/:id/finalize",
  resolveBusiness,
  assertShopAccess,
  requireRole("Owner", "Admin", "Manager", "Salesperson"),
  validateBody(saleFinalizeSchema),
  controller.finalizeSale
);

export default router;
