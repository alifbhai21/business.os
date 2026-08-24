import { Request, Response } from "express";
import * as backupService from "../services/backup.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 11 — backup status + new-device restore.
 *
 * Device identity comes from the VERIFIED access-token claims (05.13);
 * no endpoint here ever reads a deviceId from the request.
 */

export const backupStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const status = await backupService.backupStatus(req.user.id, businessId);
  return sendSuccess(res, status);
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const result = await backupService.restoreData(req.user.id, req.user.deviceId ?? null, {
    businessId,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  return sendSuccess(res, result);
});
