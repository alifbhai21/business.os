import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");

/** Integer quantity, > 0. */
const positiveQty = z.number().int("must be a whole number").positive("must be > 0").safe();

/** Integer quantity, >= 0. */
const nonNegativeQty = z.number().int("must be a whole number").nonnegative("must be >= 0").safe();

export const adjustStockSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    productId: objectId,
    qtyChange: z
      .number()
      .int("qtyChange must be a whole number")
      .safe()
      .refine((v) => v !== 0, "qtyChange must be non-zero"),
    reason: z.string().trim().min(1, "reason is required").max(500),
    kind: z.enum(["adjustment", "damage"]),
    localId: z.string().trim().max(80).optional().nullable(),
  })
  .strict();

export const openingStockSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    productId: objectId,
    quantity: nonNegativeQty,
    localId: z.string().trim().max(80).optional().nullable(),
  })
  .strict();

export const saleReturnSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    items: z
      .array(
        z
          .object({
            productId: objectId,
            qty: positiveQty,
          })
          .strict()
      )
      .min(1, "At least one return line is required")
      .max(200),
    reason: z.string().trim().max(500).optional().nullable(),
    localId: z.string().trim().max(80).optional().nullable(),
  })
  .strict();

export const purchaseReturnSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    items: z
      .array(
        z
          .object({
            productId: objectId,
            qty: positiveQty,
          })
          .strict()
      )
      .min(1, "At least one return line is required")
      .max(200),
    reason: z.string().trim().max(500).optional().nullable(),
    localId: z.string().trim().max(80).optional().nullable(),
  })
  .strict();

export const createTransferSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    sourceShopId: objectId,
    destShopId: objectId,
    productId: objectId,
    quantity: positiveQty,
    notes: z.string().trim().max(500).optional().nullable(),
    localId: z.string().trim().max(80).optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.sourceShopId === data.destShopId) {
      ctx.addIssue({
        code: "custom",
        path: ["destShopId"],
        message: "Source and destination shops must be different",
      });
    }
  });

export const updateTransferStatusSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    status: z.enum(["IN_TRANSIT", "RECEIVED", "CANCELLED"]),
  })
  .strict();