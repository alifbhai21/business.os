import { Schema, model, Document, Types } from "mongoose";

export const STOCK_TRANSFER_STATUSES = ["PENDING", "IN_TRANSIT", "RECEIVED", "CANCELLED"] as const;
export type StockTransferStatus = (typeof STOCK_TRANSFER_STATUSES)[number];

/**
 * Phase 06 — Stock transfer between two shops of the SAME business.
 *
 * A transfer moves stock from `sourceShopId` to `destShopId`. The source shop
 * writes a `transfer` StockMovement (qtyChange negative) when the transfer is
 * created; the destination shop writes a `transfer` StockMovement (qtyChange
 * positive) when it is marked RECEIVED. Both movements are immutable and
 * reference the same StockTransfer document via refType TRANSFER / refId.
 */
export interface StockTransferDocument extends Document {
  businessId: Types.ObjectId;
  sourceShopId: Types.ObjectId;
  destShopId: Types.ObjectId;
  productId: Types.ObjectId;
  /** Integer quantity being moved. */
  quantity: number;
  status: StockTransferStatus;
  notes: string | null;
  createdBy: Types.ObjectId;
  localId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const stockTransferSchema = new Schema<StockTransferDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    sourceShopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    destShopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true },
    status: { type: String, enum: [...STOCK_TRANSFER_STATUSES], default: "PENDING" },
    notes: { type: String, default: null, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localId: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { timestamps: true }
);

// Tenant-scoped listing.
stockTransferSchema.index({ businessId: 1, createdAt: -1 });
// Per-shop transfer history (source or destination).
stockTransferSchema.index({ businessId: 1, sourceShopId: 1, createdAt: -1 });
stockTransferSchema.index({ businessId: 1, destShopId: 1, createdAt: -1 });
// Offline-sync idempotency: one transfer per device-generated localId.
stockTransferSchema.index(
  { businessId: 1, localId: 1 },
  { unique: true, partialFilterExpression: { localId: { $type: "string" } } }
);

export const StockTransfer = model<StockTransferDocument>("StockTransfer", stockTransferSchema);