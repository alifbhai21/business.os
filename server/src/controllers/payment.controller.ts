import { Request, Response } from "express";
import * as paymentService from "../services/payment.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { payment, duplicate } = await paymentService.recordPayment(req.user.id, req.body);
  return sendSuccess(res, { ...payment, duplicate }, duplicate ? 200 : 201);
});

export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = (req.query.shopId as string) ?? null;
  const data = await paymentService.listPayments(req.user.id, businessId, shopId);
  return sendSuccess(res, data);
});

export const getPayment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = req.query.shopId as string;
  if (!shopId) throw ApiError.badRequest("shopId query param is required");
  const data = await paymentService.getPayment(req.user.id, businessId, shopId, req.params.id);
  return sendSuccess(res, data);
});