import { Request, Response } from "express";
import * as businessService from "../services/business.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listBusinesses = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await businessService.listUserBusinesses(req.user.id);
  return sendSuccess(res, data);
});

export const createBusiness = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await businessService.createBusiness(req.user.id, req.body);
  return sendSuccess(res, data, 201);
});

export const getBusiness = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const id = req.params.id;
  const data = await businessService.getBusinessForUser(req.user.id, id);
  return sendSuccess(res, data);
});

export const updateBusiness = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const id = req.params.id;
  const data = await businessService.updateBusinessForUser(req.user.id, id, req.body);
  return sendSuccess(res, data);
});

export const getModules = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const id = req.params.id;
  const data = await businessService.getModulesForUser(req.user.id, id);
  return sendSuccess(res, data);
});