import { Request, Response } from "express";
import * as transferService from "../services/transfer.service";
import { sendSuccess, sendPaginated } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const createTransfer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { transfer, duplicate } = await transferService.createTransfer(req.user.id, req.body);
  return sendSuccess(res, { ...transfer, duplicate }, duplicate ? 200 : 201);
});

export const updateTransferStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { transfer, duplicate } = await transferService.updateTransferStatus(req.user.id, {
    ...req.body,
    transferId: req.params.id,
  });
  return sendSuccess(res, { ...transfer, duplicate }, 200);
});

export const listTransfers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = (req.query.shopId as string) ?? null;
  const { items, pagination } = await transferService.listTransfers(
    req.user.id,
    businessId,
    shopId,
    req.query as never
  );
  return sendPaginated(res, items, pagination);
});