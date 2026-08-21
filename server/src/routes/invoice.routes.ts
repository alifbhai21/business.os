import { Router } from "express";
import * as controller from "../controllers/invoice.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness, assertShopAccess } from "../middleware/tenant";

const router = Router();

router.use(requireAuth);

/**
 * Invoices are READ-ONLY projections of finalized sales/purchases, so there is
 * no POST/PUT/DELETE here and no `requireRole`: read access matches the existing
 * `GET /sales/:id` and `GET /purchases/:id` contract, where any ACTIVE member of
 * the business (Viewer included) may read within its shop scope.
 *
 * The two register routes are declared BEFORE `/:type/:id` so `/invoices/sales`
 * is never swallowed by the parameterised path.
 */
router.get("/sales", resolveBusiness, assertShopAccess, controller.listSaleInvoices);
router.get("/purchases", resolveBusiness, assertShopAccess, controller.listPurchaseInvoices);
router.get("/:type/:id", resolveBusiness, assertShopAccess, controller.getInvoice);

export default router;
