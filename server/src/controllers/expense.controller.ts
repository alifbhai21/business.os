import { Request, Response } from "express";
import * as expenseService from "../services/expense.service";
import { sendSuccess, sendPaginated } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createExpense = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await expenseService.createExpense(req.user.id, req.body);
  return sendSuccess(res, data, 201);
});

export const listExpenses = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = (req.query.shopId as string) ?? null;
  const { items, pagination } = await expenseService.listExpenses(
    req.user.id,
    businessId,
    shopId,
    req.query as never
  );
  return sendPaginated(res, items, pagination);
});

export const getExpense = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = req.query.shopId as string;
  if (!shopId) throw ApiError.badRequest("shopId query param is required");
  const data = await expenseService.getExpense(req.user.id, businessId, shopId, req.params.id);
  return sendSuccess(res, data);
});
