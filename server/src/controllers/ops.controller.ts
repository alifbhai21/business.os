import { Request, Response } from "express";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { opsSnapshot, assertOpsViewer } from "../services/ops.service";

export const metrics = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await assertOpsViewer(req.user.id);
  return sendSuccess(res, opsSnapshot());
});
