import { Request, Response } from "express";
import * as accountingService from "../services/accounting.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** Shared query extraction for the read-only accounting endpoints. */
function reportQuery(req: Request) {
  return {
    from: (req.query.from as string) ?? null,
    to: (req.query.to as string) ?? null,
  };
}

function scope(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = (req.query.shopId as string) ?? null;
  return { userId: req.user.id, businessId, shopId };
}

export const listJournal = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await accountingService.listJournal(userId, businessId, shopId, {
    ...reportQuery(req),
    page: req.query.page,
    limit: req.query.limit,
    referenceType: req.query.referenceType,
  });
  return sendSuccess(res, data);
});

/** Phase 12 — canonical chart of accounts (config-served, read-only). */
export const chart = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId } = scope(req);
  const data = await accountingService.chartOfAccounts(userId, businessId);
  return sendSuccess(res, data);
});

export const generalLedger = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await accountingService.generalLedger(userId, businessId, shopId, {
    ...reportQuery(req),
    page: req.query.page,
    limit: req.query.limit,
    accountName: req.query.accountName,
  });
  return sendSuccess(res, data);
});

export const trialBalance = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await accountingService.trialBalance(userId, businessId, shopId, reportQuery(req));
  return sendSuccess(res, data);
});

export const profitLoss = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await accountingService.profitLoss(userId, businessId, shopId, reportQuery(req));
  return sendSuccess(res, data);
});

export const balanceSheet = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await accountingService.balanceSheet(userId, businessId, shopId, reportQuery(req));
  return sendSuccess(res, data);
});

export const cashFlow = asyncHandler(async (req: Request, res: Response) => {
  const { userId, businessId, shopId } = scope(req);
  const data = await accountingService.cashFlow(userId, businessId, shopId, reportQuery(req));
  return sendSuccess(res, data);
});
