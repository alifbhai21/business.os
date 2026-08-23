import { Request, Response } from "express";
import * as reportService from "../services/report.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** Shared query extraction for the read-only report endpoints. */
function scope(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = (req.query.shopId as string) ?? null;
  return { userId: req.user.id, businessId, shopId };
}

export const sales = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await reportService.salesReport(userId, businessId, shopId, {
    groupBy: req.query.groupBy,
    from: req.query.from,
    to: req.query.to,
    page: req.query.page,
    limit: req.query.limit,
  });
  return sendSuccess(res, data);
});

export const purchases = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await reportService.purchasesReport(userId, businessId, shopId, {
    groupBy: req.query.groupBy,
    from: req.query.from,
    to: req.query.to,
    page: req.query.page,
    limit: req.query.limit,
  });
  return sendSuccess(res, data);
});

export const inventory = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await reportService.inventoryReport(userId, businessId, shopId, {
    from: req.query.from,
    to: req.query.to,
    page: req.query.page,
    limit: req.query.limit,
  });
  return sendSuccess(res, data);
});

export const profitLoss = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await reportService.profitLossReport(userId, businessId, shopId, {
    from: req.query.from,
    to: req.query.to,
  });
  return sendSuccess(res, data);
});

export const receivables = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await reportService.receivablesReport(userId, businessId, shopId, {
    page: req.query.page,
    limit: req.query.limit,
  });
  return sendSuccess(res, data);
});

export const payables = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await reportService.payablesReport(userId, businessId, shopId, {
    page: req.query.page,
    limit: req.query.limit,
  });
  return sendSuccess(res, data);
});

export const expenses = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await reportService.expensesReport(userId, businessId, shopId, {
    from: req.query.from,
    to: req.query.to,
  });
  return sendSuccess(res, data);
});
