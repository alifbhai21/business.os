import { Router } from "express";
import * as controller from "../controllers/audit.controller";
import { requireAuth } from "../middleware/auth";
import { validateQuery } from "../middleware/validate";
import { auditListQuerySchema } from "../validation/team.schemas";

const router = Router();

router.use(requireAuth);

// RBAC (Owner/Admin/Manager/Accountant) + shop pinning enforced in the service.
router.get("/", validateQuery(auditListQuerySchema), controller.listAudit);

export default router;