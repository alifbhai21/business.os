import { z } from "zod";

const optionalText = z.string().max(255).optional().nullable();
const optionalPhone = z.string().max(30).optional().nullable();
// Money amounts are integer paisa (৳ × 100). Floats are rounded by the service.
const paisa = z.number().min(0).max(1_000_000_000_000);

export const supplierCreateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1, "Supplier name is required").max(120),
  phone: optionalPhone,
  email: z.string().email().optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  address: optionalText,
  openingBalance: paisa.default(0),
});

export const supplierUpdateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1, "Supplier name is required").max(120).optional(),
  phone: optionalPhone,
  email: z.string().email().optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  address: optionalText,
  openingBalance: paisa.optional(),
});

export const supplierStatusSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
