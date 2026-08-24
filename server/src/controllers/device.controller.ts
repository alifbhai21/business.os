import { Request, Response } from "express";
import * as deviceService from "../services/device.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const registerDevice = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await deviceService.registerDevice(req.user.id, req.body);
  return sendSuccess(res, data, data.duplicate ? 200 : 201);
});

export const listDevices = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await deviceService.listDevices(req.user.id, {
    businessId,
    shopId: req.query.shopId as string | undefined,
    status: req.query.status as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  return sendSuccess(res, data);
});

export const revokeDevice = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body?.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await deviceService.revokeDevice(req.user.id, businessId, req.params.id);
  return sendSuccess(res, data);
});

export const updateSync = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body?.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await deviceService.updateSync(req.user.id, businessId, req.params.id);
  return sendSuccess(res, data);
});