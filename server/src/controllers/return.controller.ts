import { Request, Response } from "express";
import * as returnService from "../services/return.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const returnSale = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { sale, duplicate } = await returnService.returnSale(req.user.id, {
    ...req.body,
    saleId: req.params.id,
  });
  return sendSuccess(res, { ...sale, duplicate }, duplicate ? 200 : 201);
});

export const returnPurchase = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { purchase, duplicate } = await returnService.returnPurchase(req.user.id, {
    ...req.body,
    purchaseId: req.params.id,
  });
  return sendSuccess(res, { ...purchase, duplicate }, duplicate ? 200 : 201);
});