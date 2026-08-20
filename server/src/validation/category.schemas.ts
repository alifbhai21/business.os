import { z } from "zod";

const optionalText = z.string().max(255).optional().nullable();

export const categoryCreateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1, "Category name is required").max(120),
  description: optionalText,
});

export const categoryUpdateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1, "Category name is required").max(120).optional(),
  description: optionalText,
});

export const categoryStatusSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
