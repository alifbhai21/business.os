import { z } from "zod";

const optionalText = z.string().max(255).optional().nullable();
const optionalLongText = z.string().max(2000).optional().nullable();
const optionalId = z.string().max(64).optional().nullable();

// Money amounts are integer paisa (৳ × 100). Floats are rounded by the service.
const paisa = z.number().min(0).max(1_000_000_000_000);

export const productCreateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1, "Product name is required").max(120),
  categoryId: optionalId,
  sku: z.string().trim().max(100).optional().nullable(),
  barcode: z.string().trim().max(100).optional().nullable(),
  brand: z.string().trim().max(100).optional().nullable(),
  unit: z.string().trim().min(1, "Unit is required").max(30).default("piece"),
  purchasePrice: paisa.default(0),
  sellingPrice: paisa.default(0),
  wholesalePrice: paisa.default(0),
  minPrice: paisa.default(0),
  taxRate: z.number().min(0).max(100).default(0),
  currentStock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(0),
  maxStock: z.number().int().min(0).default(0),
  preferredSupplierId: optionalId,
  imageUrl: z.string().max(500).optional().nullable(),
  description: optionalLongText,
});

export const productUpdateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  name: z.string().trim().min(1, "Product name is required").max(120).optional(),
  categoryId: optionalId,
  sku: z.string().trim().max(100).optional().nullable(),
  barcode: z.string().trim().max(100).optional().nullable(),
  brand: z.string().trim().max(100).optional().nullable(),
  unit: z.string().trim().min(1, "Unit is required").max(30).optional(),
  purchasePrice: paisa.optional(),
  sellingPrice: paisa.optional(),
  wholesalePrice: paisa.optional(),
  minPrice: paisa.optional(),
  taxRate: z.number().min(0).max(100).optional(),
  currentStock: z.number().int().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
  maxStock: z.number().int().min(0).optional(),
  preferredSupplierId: optionalId,
  imageUrl: z.string().max(500).optional().nullable(),
  description: optionalLongText,
});

export const productStatusSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const productBarcodeQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  barcode: z.string().trim().min(1, "barcode is required").max(100),
});
