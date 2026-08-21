import { Request, Response } from "express";
import * as saleService from "../services/sale.service";
import * as voidService from "../services/void.service";
import * as settlementService from "../services/settlement.service";
import { sendSuccess, sendPaginated } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createSale = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  // deviceId comes from the VERIFIED token claims (05.13), never the body —
  // the Zod schema is .strict() so a client cannot supply one at all.
  const { sale, duplicate } = await saleService.createSale(req.user.id, {
    ...req.body,
    deviceId: req.user.deviceId ?? null,
  });
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

export const voidSale = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId, ...rest } = req.body;
  const { sale, duplicate } = await voidService.voidSale(
    req.user.id,
    businessId,
    shopId,
    req.params.id,
    rest
  );
  return sendSuccess(res, { ...sale, duplicate });
});

export const recordSalePayment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId, ...payment } = req.body;
  // deviceId comes from the VERIFIED token claims (05.13), never the body.
  const { payment: created, sale, duplicate } = await settlementService.recordSalePayment(
    req.user.id,
    businessId,
    shopId,
    req.params.id,
    { businessId, shopId, ...payment, deviceId: req.user.deviceId ?? null }
  );
  return sendSuccess(res, { payment: created, sale, duplicate }, duplicate ? 200 : 201);
});

export const listSalePayments = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = req.query.shopId as string;
  if (!shopId) throw ApiError.badRequest("shopId query param is required");
  const data = await settlementService.listSalePayments(
    req.user.id,
    businessId,
    shopId,
    req.params.id
  );
  return sendSuccess(res, data);
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
