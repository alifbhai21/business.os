import { Schema, model, Document, Types } from "mongoose";

export const SALE_STATUSES = ["DRAFT", "COMPLETED", "VOIDED"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const PAYMENT_STATUSES = ["UNPAID", "PARTIAL", "PAID"] as const;
export type SalePaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * A sale line. Product name and cost price are SNAPSHOTS taken at sale time —
 * later edits to the Product must never rewrite history (and Phase 07 profit
 * reads costPrice from here, not from the live product).
 */
export interface SaleItem {
  productId: Types.ObjectId;
  productName: string;
  qty: number;
  /** Integer paisa. */
  unitPrice: number;
  /** Integer paisa — snapshot of Product.avgCost (or purchasePrice) at sale time. */
  costPrice: number;
  /** Integer paisa — per-line discount. */
  discountAmount: number;
  /** Integer paisa — server-computed from Product.taxRate. */
  taxAmount: number;
  /** Integer paisa — (qty × unitPrice) − discountAmount + taxAmount. */
  lineTotal: number;
}

export interface SaleDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  /** Allocated from the atomic BusinessCounter at finalization; null while DRAFT. */
  invoiceNo: string | null;
  customerId: Types.ObjectId | null;
  /** Snapshot; also carries the walk-in name when customerId is null. */
  customerName: string | null;
  items: SaleItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: SalePaymentStatus;
  status: SaleStatus;
  notes: string | null;
  saleDate: Date;
  createdBy: Types.ObjectId;
  localId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const saleItemSchema = new Schema<SaleItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true }, // integer paisa
    costPrice: { type: Number, default: 0 }, // integer paisa
    discountAmount: { type: Number, default: 0 }, // integer paisa
    taxAmount: { type: Number, default: 0 }, // integer paisa
    lineTotal: { type: Number, required: true }, // integer paisa
  },
  { _id: false }
);

const saleSchema = new Schema<SaleDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    invoiceNo: { type: String, default: null, trim: true, maxlength: 80 },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    customerName: { type: String, default: null, trim: true, maxlength: 200 },
    items: { type: [saleItemSchema], required: true },
    subtotal: { type: Number, required: true }, // integer paisa
    discountAmount: { type: Number, default: 0 }, // integer paisa
    taxAmount: { type: Number, default: 0 }, // integer paisa
    total: { type: Number, required: true }, // integer paisa
    paidAmount: { type: Number, default: 0 }, // integer paisa
    dueAmount: { type: Number, default: 0 }, // integer paisa
    paymentStatus: { type: String, enum: [...PAYMENT_STATUSES], default: "UNPAID" },
    status: { type: String, enum: [...SALE_STATUSES], default: "DRAFT" },
    notes: { type: String, default: null, trim: true, maxlength: 500 },
    saleDate: { type: Date, required: true, default: () => new Date() },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localId: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { timestamps: true }
);

// Invoice numbers are unique within a business. Partial filter so the many
// DRAFT sales with invoiceNo === null do not collide.
saleSchema.index(
  { businessId: 1, invoiceNo: 1 },
  { unique: true, partialFilterExpression: { invoiceNo: { $type: "string" } } }
);
// Offline-sync idempotency: one sale per device-generated localId.
saleSchema.index(
  { businessId: 1, localId: 1 },
  { unique: true, partialFilterExpression: { localId: { $type: "string" } } }
);
// Tenant-scoped listing, newest first.
saleSchema.index({ businessId: 1, shopId: 1, saleDate: -1 });
// Customer ledger / statement reads.
saleSchema.index({ businessId: 1, customerId: 1, saleDate: -1 });
// Status dashboards (outstanding dues, drafts).
saleSchema.index({ businessId: 1, shopId: 1, status: 1, paymentStatus: 1 });

export const Sale = model<SaleDocument>("Sale", saleSchema);
