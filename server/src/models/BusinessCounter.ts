import { Schema, model, Document, Types } from "mongoose";

/**
 * Atomic invoice/sequence counter per (business, shop, key).
 *
 * Phase 05 architecture decision #7: invoice numbers MUST come from an
 * atomic BusinessCounter — never countDocuments()+1 (which races and can
 * produce duplicates under concurrency).
 *
 * The counter is incremented inside the same MongoDB transaction as the
 * finalized Sale/Purchase, guaranteeing a unique, gap-safe sequence even
 * under concurrent writes.
 */
export interface BusinessCounterDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  key: string; // e.g. "SALE", "PURCHASE", "PAYMENT", "EXPENSE"
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

const businessCounterSchema = new Schema<BusinessCounterDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    key: { type: String, required: true, trim: true, maxlength: 40 },
    sequence: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One counter per (business, shop, key) — the atomic sequence source.
businessCounterSchema.index({ businessId: 1, shopId: 1, key: 1 }, { unique: true });

export const BusinessCounter = model<BusinessCounterDocument>(
  "BusinessCounter",
  businessCounterSchema
);