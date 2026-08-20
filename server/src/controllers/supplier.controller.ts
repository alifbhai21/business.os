import { Request, Response } from "express";
import * as supplierService from "../services/supplier.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await supplierService.createSupplier(req.user.id, req.body);
  return sendSuccess(res, data, 201);
});

export const listSuppliers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await supplierService.listSuppliers(req.user.id, businessId, req.query as never);
  return sendSuccess(res, data);
});

export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await supplierService.getSupplier(req.user.id, businessId, req.params.id);
  return sendSuccess(res, data);
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await supplierService.updateSupplier(
    req.user.id,
    businessId,
    req.params.id,
    req.body
  );
  return sendSuccess(res, data);
});

export const updateSupplierStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await supplierService.updateSupplierStatus(
    req.user.id,
    businessId,
    req.params.id,
    req.body.status
  );
  return sendSuccess(res, data);
});
