import { z } from "zod";
import { BUSINESS_TYPES } from "../models/Business";

const typeEnum = z.enum(BUSINESS_TYPES as [string, ...string[]]);
const phoneEnum = z.string().max(30).optional().nullable();
const optionalText = z.string().max(255).optional().nullable();

export const businessCreateSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(120),
  type: typeEnum,
  currency: z.string().max(10).optional().default("BDT"),
  taxRate: z.number().min(0).max(100).optional().default(0),
  fiscalYear: z.string().max(40).optional(),
  allowNegativeStock: z.boolean().optional().default(false),
  address: optionalText,
  phone: phoneEnum,
  email: z.string().email().optional().nullable(),
});

export const businessUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: typeEnum.optional(),
  address: optionalText,
  phone: phoneEnum,
  email: z.string().email().optional().nullable(),
  allowNegativeStock: z.boolean().optional(),
});

export const shopCreateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1, "Shop name is required").max(120),
  branchCode: z.string().trim().min(1, "branchCode is required").max(50),
  address: optionalText,
  phone: phoneEnum,
  manager: optionalText,
  isWarehouse: z.boolean().optional().default(false),
  openingCash: z.number().min(0).optional().default(0),
});

export const shopUpdateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1).max(120).optional(),
  branchCode: z.string().trim().min(1).max(50).optional(),
  address: optionalText,
  phone: phoneEnum,
  manager: optionalText,
  isWarehouse: z.boolean().optional(),
});

export const shopStatusSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
