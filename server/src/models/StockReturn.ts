import { Schema, model, Document, Types } from "mongoose";

export const STOCK_RETURN_TYPES = ["SALE_RETURN", "PURCHASE_RETURN"] as const;
export type StockReturnType = (typeof STOCK_RETURN_TYPES)[number];

export interface StockReturnItemSnapshot {
  productId: Types.ObjectId;
  qty: number;
}

/**
 * Phase 06 — Return document.
 *
 * A return reverses part of a completed Sale or Purchase. The original
 * sale/purchase is NEVER mutated beyond its per-line `returnedQty` counters;
 * this document is the immutable record of WHO returned WHAT and WHY, and it
 * is the referenceId of the reversal StockMovements and the balanced
 * SALE_RETURN/PURCHASE_RETURN journal entry.
 *
 * Idempotency (05.13 pattern): `localId` carries a unique partial index so a
 * retried offline return resolves to the ORIGINAL record instead of applying
 * the stock + financial reversal twice.
 */
export interface StockReturnDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  type: StockReturnType;
  /** The returned Sale._id or Purchase._id. */
  sourceDocId: Types.ObjectId;
  items: StockReturnItemSnapshot[];
  /** Integer paisa totals reversed by this return. */
  returnedAmount: number;
  returnedPaid: number;
  returnedDue: number;
  reason: string | null;
  createdBy: Types.ObjectId;
  localId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const stockReturnSchema = new Schema<StockReturnDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    type: { type: String, enum: [...STOCK_RETURN_TYPES], required: true },
    sourceDocId: { type: Schema.Types.ObjectId, required: true },
    items: {
      type: [
        {
          productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
          qty: { type: Number, required: true },
        },
      ],
      default: [],
    },
    returnedAmount: { type: Number, required: true }, // integer paisa
    returnedPaid: { type: Number, required: true }, // integer paisa
    returnedDue: { type: Number, required: true }, // integer paisa
    reason: { type: String, default: null, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localId: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { timestamps: true }
);

// Tenant-scoped return history, newest first.
stockReturnSchema.index({ businessId: 1, createdAt: -1 });
// All returns against one source document.
stockReturnSchema.index({ businessId: 1, sourceDocId: 1 });
// Offline-sync idempotency: one return per device-generated localId. The
// partial filter lets the many online returns with localId === null coexist,
// and the uniqueness is what makes a retried offline return resolve to the
// original instead of double-restoring stock and double-reversing money.
stockReturnSchema.index(
  { businessId: 1, localId: 1 },
  { unique: true, partialFilterExpression: { localId: { $type: "string" } } }
);

export const StockReturn = model<StockReturnDocument>("StockReturn", stockReturnSchema);
