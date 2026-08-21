import { z } from "zod";
import { PAYMENT_METHODS } from "../config/accounts";
import { positivePaisa } from "./sale.schemas";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");

/** Integer paisa, >= 0. */
const nonNegativePaisa = z
  .number()
  .int("must be integer paisa")
  .nonnegative("must be >= 0")
  .safe("exceeds the safe integer range");

const purchaseItemSchema = z
  .object({
    productId: objectId,
    qty: z.number().int("qty must be a whole number").positive("qty must be > 0").safe(),
    /** Optional override; defaults to the product's purchasePrice server-side. */
    unitPrice: nonNegativePaisa.optional(),
    discountAmount: nonNegativePaisa.optional(),
  })
  .strict();

/**
 * `.strict()` (Phase 05 convention) — unknown keys are rejected rather than
 * silently dropped. That is what stops a client from supplying `total`,
 * `taxAmount`, `avgCost`, `currentStock`, `createdBy` or journal data: those
 * fields are simply not in the schema, so sending them is a 400.
 */
export const purchaseCreateSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    supplierId: objectId,
    supplierInvoiceNo: z.string().trim().max(80).optional().nullable(),
    items: z.array(purchaseItemSchema).min(1, "At least one item is required").max(200),
    discountAmount: nonNegativePaisa.optional(),
    discountPercent: z.number().min(0).max(100).optional(),
    paidAmount: nonNegativePaisa.optional(),
    accountId: objectId.optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    purchaseDate: z
      .string()
      .datetime("purchaseDate must be an ISO 8601 date-time")
      .optional()
      .nullable(),
    localId: z.string().trim().max(80).optional().nullable(),
    /** true → store as DRAFT with no stock/financial effect. */
    draft: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.discountAmount !== undefined && data.discountPercent !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["discountPercent"],
        message: "Provide either discountAmount or discountPercent, not both",
      });
    }
    const seen = new Set<string>();
    data.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "productId"],
          message: "Duplicate productId — merge the lines into one",
        });
      }
      seen.add(item.productId);
    });
    if (data.paidAmount !== undefined && data.paidAmount > 0 && !data.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "accountId is required when paidAmount > 0",
      });
    }
  });

/** Finalizing may settle part or all of the supplier bill at the same time. */
export const purchaseFinalizeSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    paidAmount: nonNegativePaisa.optional(),
    accountId: objectId.optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.paidAmount !== undefined && data.paidAmount > 0 && !data.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "accountId is required when paidAmount > 0",
      });
    }
  });

/**
 * Voiding takes no financial input: reversal amounts come from the stored
 * purchase and the refunded account is the one snapshotted at finalization.
 */
export const purchaseVoidSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

/**
 * Settling a supplier bill (05.11). The supplier, the payment `type` and the
 * `purchaseId` link come from the stored purchase; `.strict()` rejects any field
 * that would let a client redirect the money or restate the bill's own figures.
 */
export const purchasePaymentSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    amount: positivePaisa,
    method: z.enum([...PAYMENT_METHODS] as [string, ...string[]]),
    accountId: objectId,
    note: z.string().trim().max(500).optional().nullable(),
    idempotencyKey: z.string().trim().min(1, "idempotencyKey is required").max(120),
    paymentDate: z
      .string()
      .datetime("paymentDate must be an ISO 8601 date-time")
      .optional()
      .nullable(),
    localId: z.string().trim().max(80).optional().nullable(),
  })
  .strict();

export type PurchaseCreateInput = z.infer<typeof purchaseCreateSchema>;
export type PurchaseFinalizeInput = z.infer<typeof purchaseFinalizeSchema>;
export type PurchaseVoidInput = z.infer<typeof purchaseVoidSchema>;
export type PurchasePaymentRequestInput = z.infer<typeof purchasePaymentSchema>;
