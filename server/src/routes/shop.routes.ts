import { Router } from "express";
import * as controller from "../controllers/shop.controller";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { shopCreateSchema, shopUpdateSchema, shopStatusSchema } from "../validation/business.schemas";

const router = Router();

router.use(requireAuth);

router.post("/", validateBody(shopCreateSchema), controller.createShop);
router.get("/", controller.listShops);
router.get("/:id", controller.getShop);
router.put("/:id", validateBody(shopUpdateSchema), controller.updateShop);
router.patch("/:id", validateBody(shopUpdateSchema), controller.updateShop);
router.patch("/:id/status", validateBody(shopStatusSchema), controller.updateShopStatus);

export default router;