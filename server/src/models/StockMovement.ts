import { Schema, model, Document, Types } from "mongoose";

/**
 * Immutable inventory ledger. Every change to Product.currentStock must be
 * accompanied by exactly one StockMovement so stock is auditable and
 * reconstructable — the product document is a cached running total.
 *
 * The full type enum is declared up front (Phase 06 returns/transfers/
 * adjustments will write the remaining types); Phase 05 Sale writes "sale".
 */
export const STOCK_MOVEMENT_TYPES = [
  "sale",
  "sale_return",
  "purchase",
  "purchase_return",
  "transfer",
  "adjustment",
  "damage",
  "opening",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_REF_TYPES = [
  "SALE",
  "SALE_RETURN",
  "PURCHASE",
  "PURCHASE_RETURN",
  "TRANSFER",
  "ADJUSTMENT",
  "DAMAGE",
  "OPENING",
] as const;
export type StockMovementRefType = (typeof STOCK_MOVEMENT_REF_TYPES)[number];

export interface StockMovementDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  productId: Types.ObjectId;
  type: StockMovementType;
  /** Signed change: negative for a sale, positive for a purchase. */
  qtyChange: number;
  prevStock: number;
  newStock: number;
  /** Unit cost in integer paisa at the time of the movement (snapshot). */
  unitCost: number;
  refType: StockMovementRefType;
  refId: Types.ObjectId;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const stockMovementSchema = new Schema<StockMovementDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    type: { type: String, enum: [...STOCK_MOVEMENT_TYPES], required: true },
    qtyChange: { type: Number, required: true },
    prevStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    unitCost: { type: Number, default: 0 }, // integer paisa
    refType: { type: String, enum: [...STOCK_MOVEMENT_REF_TYPES], required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

/**
 * Idempotency guard (phase-05 architecture decision): one movement per
 * (business, source document, product). A duplicate finalize of the same sale
 * hits this unique index instead of double-applying stock.
 */
stockMovementSchema.index(
  { businessId: 1, refType: 1, refId: 1, productId: 1 },
  { unique: true }
);
// Product stock history and per-shop inventory ledger reads.
stockMovementSchema.index({ businessId: 1, productId: 1, createdAt: -1 });
stockMovementSchema.index({ businessId: 1, shopId: 1, createdAt: -1 });

export const StockMovement = model<StockMovementDocument>(
  "StockMovement",
  stockMovementSchema
);
