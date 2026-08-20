import { Router } from "express";
import * as controller from "../controllers/business.controller";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { businessCreateSchema, businessUpdateSchema } from "../validation/business.schemas";

const router = Router();

router.use(requireAuth);

router.get("/", controller.listBusinesses);
router.post("/", validateBody(businessCreateSchema), controller.createBusiness);
router.get("/:id", controller.getBusiness);
router.put("/:id", validateBody(businessUpdateSchema), controller.updateBusiness);
router.patch("/:id", validateBody(businessUpdateSchema), controller.updateBusiness);
router.get("/:id/modules", controller.getModules);

export default router;