import { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { sendSuccess, sendMessage } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, phone, password, deviceId, deviceName, platform, appVersion } = req.body;
  const result = await authService.register({
    name,
    email,
    phone,
    password,
    deviceId,
    deviceName,
    platform,
    appVersion,
  });
  return sendSuccess(res, result, 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body);
  return sendSuccess(res, result);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken, deviceId } = req.body;
  const result = await authService.refresh(refreshToken, deviceId);
  return sendSuccess(res, result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.body.refreshToken);
  return sendMessage(res, "Logged out");
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await authService.logoutAll(req.user.id);
  return sendMessage(res, "Logged out from all devices");
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.forgotPassword(req.body.email);
  return sendSuccess(res, result);
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.password);
  return sendMessage(res, "Password has been reset");
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await authService.getMe(req.user.id);
  return sendSuccess(res, result);
});