import { z } from "zod";
import { PAYMENT_METHODS } from "../config/accounts";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");

/** Integer paisa, > 0. */
const positivePaisa = z
  .number()
  .int("must be integer paisa")
  .positive("must be > 0")
  .safe("exceeds the safe integer range");

/** Integer paisa, >= 0. */
const nonNegativePaisa = z
  .number()
  .int("must be integer paisa")
  .nonnegative("must be >= 0")
  .safe("exceeds the safe integer range");

const saleItemSchema = z
  .object({
    productId: objectId,
    qty: z.number().int("qty must be a whole number").positive("qty must be > 0").safe(),
    /** Optional override; defaults to the product's selling price server-side. */
    unitPrice: nonNegativePaisa.optional(),
    discountAmount: nonNegativePaisa.optional(),
    /** Phase 12 — variant resolved against Product.variants server-side. */
    variantName: z.string().trim().max(40).optional(),
  })
  .strict();

/**
 * Only inputs the server cannot derive are accepted. Totals, tax, cost price
 * and line totals are NEVER accepted from the client — `.strict()` rejects
 * them outright rather than silently ignoring them, so a client attempting to
 * spoof `total`, `taxAmount` or `costPrice` gets a 400.
 */
export const saleCreateSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    customerId: objectId.optional().nullable(),
    customerName: z.string().trim().max(200).optional().nullable(),
    items: z.array(saleItemSchema).min(1, "At least one item is required").max(200),
    discountAmount: nonNegativePaisa.optional(),
    discountPercent: z.number().min(0).max(100).optional(),
    paidAmount: nonNegativePaisa.optional(),
    accountId: objectId.optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    saleDate: z.string().datetime("saleDate must be an ISO 8601 date-time").optional().nullable(),
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

/** Finalizing may settle part or all of the invoice at the same time. */
export const saleFinalizeSchema = z
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
 * Voiding takes no financial input at all: every reversal amount is read from
 * the stored sale, and the account refunded is the one snapshotted at
 * finalization. `.strict()` therefore rejects any client attempt to steer the
 * reversal (accountId, amounts, status).
 */
export const saleVoidSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

/**
 * Settling an outstanding invoice (05.11). The counterparty, the payment `type`
 * and the `saleId` link are all read from the stored sale, so `.strict()`
 * deliberately rejects `customerId`, `type`, `saleId`, `paidAmount`,
 * `paymentStatus` and every other field that would let a client redirect the
 * money or restate the document's own figures.
 */
export const salePaymentSchema = z
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

export type SaleCreateInput = z.infer<typeof saleCreateSchema>;
export type SaleFinalizeInput = z.infer<typeof saleFinalizeSchema>;
export type SaleVoidInput = z.infer<typeof saleVoidSchema>;
export type SalePaymentRequestInput = z.infer<typeof salePaymentSchema>;
// positivePaisa is exported for reuse by Purchase (05.08) schemas.
export { positivePaisa, nonNegativePaisa };
