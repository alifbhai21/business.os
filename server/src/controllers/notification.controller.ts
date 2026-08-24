import { Request, Response } from "express";
import * as notificationService from "../services/notification.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 12 — in-app notifications. Any ACTIVE member may read/acknowledge
 * their own view; shop pins narrow visibility server-side.
 */

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  // Reading materializes current conditions first (lazy, idempotent).
  await notificationService.evaluateAndMaterialize(req.user.id, businessId);
  const result = await notificationService.listNotifications(req.user.id, {
    businessId,
    filter: req.query.filter === "unread" ? "unread" : "all",
    page: req.query.page,
    limit: req.query.limit,
  });
  return sendSuccess(res, result);
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body?.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const result = await notificationService.markRead(req.user.id, businessId, req.params.id);
  return sendSuccess(res, result);
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await notificationService.markAllRead(req.user.id, req.body.businessId);
  return sendSuccess(res, result);
});

export const getPreferences = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const prefs = await notificationService.getPreferences(req.user.id, businessId);
  return sendSuccess(res, prefs);
});

export const updatePreferences = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, ...toggles } = req.body;
  const prefs = await notificationService.updatePreferences(req.user.id, businessId, toggles);
  return sendSuccess(res, prefs);
});
