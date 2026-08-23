import { Request, Response } from "express";
import * as searchService from "../services/search.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** GET /api/v1/search?q=... - tenant-scoped cross-collection lookup. */
export const search = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const shopId = (req.query.shopId as string) ?? null;
  const data = await searchService.globalSearch(req.user.id, businessId, shopId, req.query.q);
  return sendSuccess(res, data);
});
