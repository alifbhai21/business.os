import { Router } from "express";
import * as controller from "../controllers/category.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import {
  categoryCreateSchema,
  categoryStatusSchema,
  categoryUpdateSchema,
} from "../validation/category.schemas";

const router = Router();

router.use(requireAuth);

router.get("/", resolveBusiness, controller.listCategories);
router.post(
  "/",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(categoryCreateSchema),
  controller.createCategory
);
router.get("/:id", resolveBusiness, controller.getCategory);
router.put(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(categoryUpdateSchema),
  controller.updateCategory
);
router.patch(
  "/:id",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(categoryUpdateSchema),
  controller.updateCategory
);
router.patch(
  "/:id/status",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(categoryStatusSchema),
  controller.updateCategoryStatus
);

export default router;
