import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as controller from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { env } from "../config/env";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validation/auth.schemas";

const router = Router();

// Test suites share one IP and exercise the full auth surface repeatedly;
// production/development keep the strict 30 req / 15 min limit.
const isTestRun = env.NODE_ENV === "test" || process.env.npm_lifecycle_event === "test";
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestRun ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests" },
  },
});

router.post("/register", authLimiter, validateBody(registerSchema), controller.register);
router.post("/login", authLimiter, validateBody(loginSchema), controller.login);
router.post("/refresh", authLimiter, validateBody(refreshSchema), controller.refresh);
router.post("/logout", validateBody(logoutSchema), controller.logout);
router.post("/logout-all", authLimiter, requireAuth, controller.logoutAll);
router.post("/forgot-password", authLimiter, validateBody(forgotPasswordSchema), controller.forgotPassword);
router.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), controller.resetPassword);
router.get("/me", requireAuth, controller.me);

export default router;