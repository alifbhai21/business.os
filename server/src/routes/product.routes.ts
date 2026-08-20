import { Router } from "express";
import * as controller from "../controllers/product.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import {
  productCreateSchema,
  productStatusSchema,
  productUpdateSchema,
} from "../validation/product.schemas";

const router = Router();

router.use(requireAuth);

// Barcode lookup must be registered before /:id.
router.get("/lookup/barcode", resolveBusiness, controller.getProductByBarcode);
router.get("/", resolveBusiness, controller.listProducts);
router.post(
  "/",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(productCreateSchema),
  controller.createProduct
);
router.get("/:id", resolveBusiness, controller.getProduct);
router.put(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(productUpdateSchema),
  controller.updateProduct
);
router.patch(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(productUpdateSchema),
  controller.updateProduct
);
router.patch(
  "/:id/status",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager", "Inventory Manager"),
  validateBody(productStatusSchema),
  controller.updateProductStatus
);

export default router;
