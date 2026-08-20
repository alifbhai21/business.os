import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";

export const ROLES = [
  "Owner",
  "Admin",
  "Manager",
  "Accountant",
  "Salesperson",
  "Inventory Manager",
  "Viewer",
] as const;

export type Role = (typeof ROLES)[number];

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.currentBusiness) throw ApiError.forbidden("Business context required");
    const role = req.currentBusiness.role as Role;
    if (!allowed.includes(role)) throw ApiError.forbidden("Insufficient role");
    next();
  };
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.currentBusiness) throw ApiError.forbidden("Business context required");
    const role = req.currentBusiness.role as Role;
    if (role === "Owner" || role === "Admin") return next();
    if (req.currentBusiness.permissions.includes(permission)) return next();
    throw ApiError.forbidden("Insufficient permission");
  };
}