import { Request, Response } from "express";
import * as employeeService from "../services/employee.service";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ROLES, ROLE_PERMISSIONS } from "../config/roles";

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await employeeService.createEmployee(req.user.id, req.body);
  return sendSuccess(res, data, 201);
});

export const listEmployees = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const data = await employeeService.listEmployees(req.user.id, {
    businessId,
    shopId: req.query.shopId as string | undefined,
    status: req.query.status as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  return sendSuccess(res, data);
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await employeeService.updateEmployee(req.user.id, req.params.id, req.body);
  return sendSuccess(res, data);
});

export const removeEmployee = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.body?.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId is required");
  const data = await employeeService.removeEmployee(req.user.id, businessId, req.params.id);
  return sendSuccess(res, data, data.duplicate ? 200 : 200);
});

// ── Roles ────────────────────────────────────────────────────

/** Server-authoritative role + permission matrix. */
export const listRoles = asyncHandler(async (_req: Request, res: Response) => {
  const roles = ROLES.map((role) => ({
    name: role,
    permissions: [...ROLE_PERMISSIONS[role]],
  }));
  return sendSuccess(res, roles);
});

export const assignRole = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await employeeService.assignRole(req.user.id, req.body);
  return sendSuccess(res, data);
});