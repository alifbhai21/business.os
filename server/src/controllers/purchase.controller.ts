import { Request, Response } from "express";
import * as purchaseService from "../services/purchase.service";
import { sendSuccess, sendPaginated } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { purchase, duplicate } = await purchaseService.createPurchase(req.user.id, req.body);
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
