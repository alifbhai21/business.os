import { Request, Response } from "express";
import * as productService from "../services/product.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await productService.createProduct(req.user.id, req.body);
  // Phase 10 — retried offline creates return the ORIGINAL row (duplicate).
  return sendSuccess(res, data, data.duplicate ? 200 : 201);
});

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await productService.listProducts(req.user.id, businessId, req.query as never);
  return sendSuccess(res, data);
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await productService.getProduct(req.user.id, businessId, req.params.id);
  return sendSuccess(res, data);
});

export const getProductByBarcode = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  const barcode = req.query.barcode as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  if (!barcode) throw ApiError.badRequest("barcode query param is required");
  const data = await productService.getProductByBarcode(req.user.id, businessId, barcode);
  return sendSuccess(res, data);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await productService.updateProduct(
    req.user.id,
    businessId,
    req.params.id,
    req.body
  );
  return sendSuccess(res, data);
});

export const updateProductStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await productService.updateProductStatus(
    req.user.id,
    businessId,
    req.params.id,
    req.body.status
  );
  return sendSuccess(res, data);
});
