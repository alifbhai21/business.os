import { Request, Response } from "express";
import * as purchaseService from "../services/purchase.service";
import * as voidService from "../services/void.service";
import * as settlementService from "../services/settlement.service";
import { sendSuccess, sendPaginated } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  // deviceId comes from the VERIFIED token claims (05.13), never the body —
  // the Zod schema is .strict() so a client cannot supply one at all.
  const { purchase, duplicate } = await purchaseService.createPurchase(req.user.id, {
    ...req.body,
    deviceId: req.user.deviceId ?? null,
  });
  return sendSuccess(res, { ...purchase, duplicate }, duplicate ? 200 : 201);
});

export const finalizePurchase = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId, ...payment } = req.body;
  const { purchase, duplicate } = await purchaseService.finalizePurchase(
    req.user.id,
    businessId,
    shopId,
    req.params.id,
    payment
  );
  return sendSuccess(res, { ...purchase, duplicate });
});

export const voidPurchase = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId, ...rest } = req.body;
  const { purchase, duplicate } = await voidService.voidPurchase(
    req.user.id,
    businessId,
    shopId,
    req.params.id,
    rest
  );
  return sendSuccess(res, { ...purchase, duplicate });
});

export const recordPurchasePayment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId, ...payment } = req.body;
  // deviceId comes from the VERIFIED token claims (05.13), never the body.
  const {
    payment: created,
    purchase,
    duplicate,
  } = await settlementService.recordPurchasePayment(
    req.user.id,
    businessId,
    shopId,
    req.params.id,
    { businessId, shopId, ...payment, deviceId: req.user.deviceId ?? null }
  );
  return sendSuccess(res, { payment: created, purchase, duplicate }, duplicate ? 200 : 201);
});

export const listPurchasePayments = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = req.query.shopId as string;
  if (!shopId) throw ApiError.badRequest("shopId query param is required");
  const data = await settlementService.listPurchasePayments(
    req.user.id,
    businessId,
    shopId,
    req.params.id
  );
  return sendSuccess(res, data);
});

export const listPurchases = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = (req.query.shopId as string) ?? null;
  const { items, pagination } = await purchaseService.listPurchases(
    req.user.id,
    businessId,
    shopId,
    req.query as never
  );
  return sendPaginated(res, items, pagination);
});

export const getPurchase = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = req.query.shopId as string;
  if (!shopId) throw ApiError.badRequest("shopId query param is required");
  const data = await purchaseService.getPurchase(req.user.id, businessId, shopId, req.params.id);
  return sendSuccess(res, data);
});
