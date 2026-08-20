import { z } from "zod";

const optionalText = z.string().max(255).optional().nullable();
const optionalPhone = z.string().max(30).optional().nullable();
// Money amounts are integer paisa (৳ × 100). Floats are rounded by the service.
const paisa = z.number().min(0).max(1_000_000_000_000);

export const customerCreateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1, "Customer name is required").max(120),
  phone: optionalPhone,
  email: z.string().email().optional().nullable(),
  address: optionalText,
  customerCode: z.string().trim().max(50).optional().nullable(),
  openingBalance: paisa.default(0),
  creditLimit: paisa.default(0),
});

export const customerUpdateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1, "Customer name is required").max(120).optional(),
  phone: optionalPhone,
  email: z.string().email().optional().nullable(),
  address: optionalText,
  customerCode: z.string().trim().max(50).optional().nullable(),
  openingBalance: paisa.optional(),
  creditLimit: paisa.optional(),
});

export const customerStatusSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
