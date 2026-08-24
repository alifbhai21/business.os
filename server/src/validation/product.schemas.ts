import { z } from "zod";

const optionalText = z.string().max(255).optional().nullable();
const optionalLongText = z.string().max(2000).optional().nullable();
const optionalId = z.string().max(64).optional().nullable();

// Money amounts are integer paisa (৳ × 100). Floats are rounded by the service.
const paisa = z.number().min(0).max(1_000_000_000_000);

/**
 * Phase 12 — product variant (catalog metadata; stock stays product-level).
 * Names are unique (case-insensitive) within the product — enforced by the
 * service so it can return a precise 409 with context.
 */
export const productVariantSchema = z
  .object({
    name: z.string().trim().min(1, "Variant name is required").max(40),
    sku: z.string().trim().max(60).optional().nullable(),
    barcode: z.string().trim().max(80).optional().nullable(),
    priceAdjustmentPaisa: paisa.default(0),
  })
  .strict();

export const productVariantsSchema = z.array(productVariantSchema).max(20, "at most 20 variants");

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
  variants: productVariantsSchema.optional(),
  // Phase 10 — offline-sync idempotency anchor (never required online).
  localId: z.string().trim().max(80).optional().nullable(),
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
  variants: productVariantsSchema.optional(),
});

export const productStatusSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const productBarcodeQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  barcode: z.string().trim().min(1, "barcode is required").max(100),
});
