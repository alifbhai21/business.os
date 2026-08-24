import { Request, Response } from "express";
import * as customerService from "../services/customer.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await customerService.createCustomer(req.user.id, req.body);
  // Phase 10 — retried offline creates return the ORIGINAL row (duplicate).
  return sendSuccess(res, data, data.duplicate ? 200 : 201);
});

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await customerService.listCustomers(req.user.id, businessId, req.query as never);
  return sendSuccess(res, data);
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await customerService.getCustomer(req.user.id, businessId, req.params.id);
  return sendSuccess(res, data);
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await customerService.updateCustomer(
    req.user.id,
    businessId,
    req.params.id,
    req.body
  );
  return sendSuccess(res, data);
});

export const updateCustomerStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await customerService.updateCustomerStatus(
    req.user.id,
    businessId,
    req.params.id,
    req.body.status
  );
  return sendSuccess(res, data);
});
