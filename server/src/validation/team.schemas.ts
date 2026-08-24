import { z } from "zod";
import { ROLES } from "../config/roles";

const roleEnum = z.enum([...ROLES] as [string, ...string[]]);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");

// ── Employees ────────────────────────────────────────────────

export const employeeCreateSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: objectId.optional().nullable(),
    name: z.string().trim().min(1, "Employee name is required").max(80),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s]{6,20}$/, "A valid phone number is required"),
    role: roleEnum,
  })
  .strict();

export const employeeUpdateSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: objectId.optional().nullable(),
    name: z.string().trim().min(1).max(80).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s]{6,20}$/, "A valid phone number is required")
      .optional(),
    role: roleEnum.optional(),
    status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]).optional(),
  })
  .strict();

export const employeeListQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  shopId: objectId.optional(),
  status: z.enum(["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// ── Roles ────────────────────────────────────────────────────

export const roleAssignSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    employeeId: objectId,
    role: roleEnum,
    /** Optional extra permissions — must exist in the server permission matrix. */
    permissions: z.array(z.string().min(1)).max(50).optional(),
  })
  .strict();

// ── Devices ──────────────────────────────────────────────────

export const deviceRegisterSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: objectId.optional().nullable(),
    deviceId: z.string().trim().min(3, "deviceId is required").max(120),
    deviceName: z.string().trim().min(1).max(80).optional(),
    platform: z.string().trim().max(30).optional(),
    appVersion: z.string().trim().max(30).optional(),
  })
  .strict();

export const deviceActionSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
  })
  .strict();

export const deviceListQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  shopId: objectId.optional(),
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// ── Audit ────────────────────────────────────────────────────

export const auditListQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  shopId: objectId.optional(),
  action: z.string().trim().min(1).max(60).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});