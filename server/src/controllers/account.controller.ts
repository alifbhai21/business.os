import { Request, Response } from "express";
import * as accountService from "../services/account.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await accountService.createAccount(req.user.id, req.body);
  return sendSuccess(res, data, 201);
});

export const listAccounts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = (req.query.shopId as string) ?? null;
  const data = await accountService.listAccounts(req.user.id, businessId, shopId);
  return sendSuccess(res, data);
});

export const getAccount = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = req.query.shopId as string;
  if (!shopId) throw ApiError.badRequest("shopId query param is required");
  const data = await accountService.getAccount(req.user.id, businessId, shopId, req.params.id);
  return sendSuccess(res, data);
});

export const updateAccount = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const shopId = req.body.shopId as string;
  if (!shopId) throw ApiError.badRequest("shopId is required");
  const data = await accountService.updateAccount(
    req.user.id,
    businessId,
    shopId,
    req.params.id,
    req.body
  );
  return sendSuccess(res, data);
});

// Phase 07 — cash transfer between two accounts of the same shop.
export const transferCash = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await accountService.transferCash(req.user.id, req.body);
  return sendSuccess(res, data, data.duplicate ? 200 : 201);
});