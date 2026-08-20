import { Request, Response } from "express";
import * as saleService from "../services/sale.service";
import { sendSuccess, sendPaginated } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createSale = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { sale, duplicate } = await saleService.createSale(req.user.id, req.body);
  return sendSuccess(res, { ...sale, duplicate }, duplicate ? 200 : 201);
});

export const finalizeSale = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId, ...payment } = req.body;
  const { sale, duplicate } = await saleService.finalizeSale(
    req.user.id,
    businessId,
    shopId,
    req.params.id,
    payment
  );
  return sendSuccess(res, { ...sale, duplicate });
});

export const listSales = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = (req.query.shopId as string) ?? null;
  const { items, pagination } = await saleService.listSales(
    req.user.id,
    businessId,
    shopId,
    req.query as never
  );
  return sendPaginated(res, items, pagination);
});

export const getSale = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = req.query.shopId as string;
  if (!shopId) throw ApiError.badRequest("shopId query param is required");
  const data = await saleService.getSale(req.user.id, businessId, shopId, req.params.id);
  return sendSuccess(res, data);
});
