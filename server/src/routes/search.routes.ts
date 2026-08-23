import { Router } from "express";
import * as controller from "../controllers/search.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";

/**
 * Phase 08 - global search.
 *
 * A lookup utility over the same collections any active member can already
 * read (products/customers/suppliers lists carry no extra role gate), so
 * every ACTIVE role may search. Tenant + shop isolation is enforced in the
 * middleware chain and re-checked in the service.
 */
const router = Router();

router.use(requireAuth);
router.use(resolveBusiness, assertShopAccess);

router.get("/", controller.search);

export default router;
