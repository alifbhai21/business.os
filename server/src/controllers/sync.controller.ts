import { Request, Response } from "express";
import * as syncService from "../services/sync.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 10 — offline sync endpoints.
 *
 * Device identity comes from the VERIFIED access-token claims (05.13);
 * the strict Zod schema rejects any client-supplied deviceId outright.
 */
export const syncPush = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const summary = await syncService.pushOps(req.user.id, req.user.deviceId ?? null, req.body);
  return sendSuccess(res, summary);
});

export const syncPull = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await syncService.pullDelta(req.user.id, {
    businessId,
    cursor: req.query.cursor as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  return sendSuccess(res, data);
});
