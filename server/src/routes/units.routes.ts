import { Router } from "express";
import { Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { sendSuccess } from "../utils/response";
import { UNITS } from "../config/units";

const router = Router();

router.use(requireAuth);

// Global predefined units (PRD §8.3) — no business-custom registry in the MVP.
router.get("/", (_req: Request, res: Response) => {
  return sendSuccess(res, UNITS);
});

export default router;
