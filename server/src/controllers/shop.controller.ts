import { Request, Response } from "express";
import * as shopService from "../services/shop.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createShop = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await shopService.createShop(req.user.id, req.body);
  return sendSuccess(res, data, 201);
});

export const listShops = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await shopService.listShops(req.user.id, businessId);
  return sendSuccess(res, data);
});

export const getShop = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await shopService.getShop(req.user.id, businessId, req.params.id);
  return sendSuccess(res, data);
});

export const updateShop = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await shopService.updateShop(req.user.id, businessId, req.params.id, req.body);
  return sendSuccess(res, data);
});

export const updateShopStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await shopService.updateShopStatus(
    req.user.id,
    businessId,
    req.params.id,
    req.body.status
  );
  return sendSuccess(res, data);
});