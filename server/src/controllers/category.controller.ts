import { Request, Response } from "express";
import * as categoryService from "../services/category.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await categoryService.createCategory(req.user.id, req.body);
  return sendSuccess(res, data, 201);
});

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await categoryService.listCategories(req.user.id, businessId, req.query as never);
  return sendSuccess(res, data);
});

export const getCategory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await categoryService.getCategory(req.user.id, businessId, req.params.id);
  return sendSuccess(res, data);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await categoryService.updateCategory(
    req.user.id,
    businessId,
    req.params.id,
    req.body
  );
  return sendSuccess(res, data);
});

export const updateCategoryStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await categoryService.updateCategoryStatus(
    req.user.id,
    businessId,
    req.params.id,
    req.body.status
  );
  return sendSuccess(res, data);
});
