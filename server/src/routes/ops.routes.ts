import { Router } from "express";
import * as controller from "../controllers/ops.controller";
import { requireAuth } from "../middleware/auth";

/**
 * Phase 14 — operations monitoring surface.
 *
 * Process health + API latency percentiles (PRD: p95 < 500ms). The payload
 * contains timing counters only — no tenant business data — so the route
 * has no business context; the Owner/Admin gate is enforced in the service
 * (assertOpsViewer) against ACTIVE memberships.
 */
const router = Router();

router.use(requireAuth);
router.get("/metrics", controller.metrics);

export default router;
