import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import mongoose from "mongoose";
import { loadEnv } from "./config/env";
import { ApiError } from "./utils/ApiError";
import { logger } from "./utils/logger";
import authRoutes from "./routes/auth.routes";
import businessRoutes from "./routes/business.routes";
import shopRoutes from "./routes/shop.routes";
import productRoutes from "./routes/product.routes";
import categoryRoutes from "./routes/category.routes";
import customerRoutes from "./routes/customer.routes";
import supplierRoutes from "./routes/supplier.routes";
import unitsRoutes from "./routes/units.routes";
import accountRoutes from "./routes/account.routes";
import paymentRoutes from "./routes/payment.routes";
import expenseRoutes from "./routes/expense.routes";
import saleRoutes from "./routes/sale.routes";

const env = loadEnv();

const app = express();

// --- Middleware stack (per PRD Appendix A) ---
app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
  }),
);

app.use(express.json({ limit: "10kb" }));
app.use(mongoSanitize());

const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute globally
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health" || req.path === "/ready",
});
app.use(globalLimiter);

// --- Health & readiness ---
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: "ok", uptime: process.uptime() });
});

app.get("/ready", (_req: Request, res: Response) => {
  const dbState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const ready = dbState === 1;
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? "ready" : "not_ready",
    db: dbState === 1 ? "connected" : "disconnected",
  });
});

// --- API v1 ---
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/businesses", businessRoutes);
app.use("/api/v1/shops", shopRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/suppliers", supplierRoutes);
app.use("/api/v1/units", unitsRoutes);
app.use("/api/v1/accounts", accountRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/expenses", expenseRoutes);
app.use("/api/v1/sales", saleRoutes);

// --- 404 ---
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(ApiError.notFound("Route not found"));
});

// --- Error handler ---
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    });
  }

  logger.error(`${req.method} ${req.path} → ${(err as Error).message}`);
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
});

export { app, env };