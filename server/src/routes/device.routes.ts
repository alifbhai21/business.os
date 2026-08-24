import { Router } from "express";
import * as controller from "../controllers/device.controller";
import { requireAuth } from "../middleware/auth";
import { resolveBusiness } from "../middleware/tenant";
import { requireRole } from "../middleware/rbac";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  deviceRegisterSchema,
  deviceActionSchema,
  deviceListQuerySchema,
} from "../validation/team.schemas";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  validateQuery(deviceListQuerySchema),
  controller.listDevices
);
// Any authenticated member registers their OWN device (userId from token).
router.post(
  "/",
  resolveBusiness,
  validateBody(deviceRegisterSchema),
  controller.registerDevice
);
// Owner/Admin/Manager revoke; terminates the device's refresh tokens.
router.put(
  "/:id/revoke",
  resolveBusiness,
  requireRole("Owner", "Admin", "Manager"),
  validateBody(deviceActionSchema),
  controller.revokeDevice
);
// Sync heartbeat — device owner only (enforced in service).
router.put(
  "/:id/sync",
  resolveBusiness,
  validateBody(deviceActionSchema),
  controller.updateSync
);

export default router;