import { Schema, model, Document, Types } from "mongoose";

export const PURCHASE_STATUSES = ["DRAFT", "COMPLETED", "VOIDED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_PAYMENT_STATUSES = ["UNPAID", "PARTIAL", "PAID"] as const;
export type PurchasePaymentStatus = (typeof PURCHASE_PAYMENT_STATUSES)[number];

/**
 * A purchase line. productName is a SNAPSHOT — later product renames must not
 * rewrite history. `netUnitCost` is the discounted, pre-tax unit cost that fed
 * the weighted-average cost recalculation, kept so Phase 07 can audit avgCost.
 */
export interface PurchaseItem {
  productId: Types.ObjectId;
  productName: string;
  qty: number;
  /** Integer paisa — unit cost charged by the supplier. */
  unitPrice: number;
  /** Integer paisa — per-line discount. */
  discountAmount: number;
  /** Integer paisa — server-computed from Product.taxRate. */
  taxAmount: number;
  /** Integer paisa — (qty × unitPrice) − discountAmount, before tax. */
  netAmount: number;
  /**
   * Integer paisa — netAmount minus this line's pro-rata share of any header
   * discount. This is the amount capitalised into inventory and fed into the
   * weighted-average cost; the sum across lines is the Inventory journal debit.
   */
  costAmount: number;
  /** Integer paisa — costAmount ÷ qty, rounded; the unit cost snapshot. */
  netUnitCost: number;
  /** Integer paisa — netAmount + taxAmount. */
  lineTotal: number;
  /**
   * Cumulative quantity returned against this line (Phase 06). Guarded by an
   * atomic `$inc` inside the return transaction so concurrent returns can never
   * drive the cumulative returned quantity above the original `qty`.
   */
  returnedQty: number;
}

export interface PurchaseDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  /** Allocated from the atomic BusinessCounter at finalization; null while DRAFT. */
  invoiceNo: string | null;
  /** Supplier reference number printed on the supplier's own bill. */
  supplierInvoiceNo: string | null;
  supplierId: Types.ObjectId;
  /** Snapshot of the supplier name at purchase time. */
  supplierName: string | null;
  items: PurchaseItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  /**
   * The physical Account debited for `paidAmount` at finalization, snapshotted
   * so 05.09 void can reverse the money back into the SAME account. Null when
   * the purchase was fully on credit.
   */
  paymentAccountId: Types.ObjectId | null;
  paymentStatus: PurchasePaymentStatus;
  status: PurchaseStatus;
  notes: string | null;
  purchaseDate: Date;
  createdBy: Types.ObjectId;
  localId: string | null;
  /**
   * The Device that originated this record (05.13). Snapshotted from the
   * verified access-token claims, never from the request body.
   */
  deviceId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseItemSchema = new Schema<PurchaseItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true }, // integer paisa
    discountAmount: { type: Number, default: 0 }, // integer paisa
    taxAmount: { type: Number, default: 0 }, // integer paisa
    netAmount: { type: Number, required: true }, // integer paisa
    costAmount: { type: Number, required: true }, // integer paisa
    netUnitCost: { type: Number, required: true }, // integer paisa
    lineTotal: { type: Number, required: true }, // integer paisa
    returnedQty: { type: Number, default: 0 },
  },
  { _id: false }
);

const purchaseSchema = new Schema<PurchaseDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    invoiceNo: { type: String, default: null, trim: true, maxlength: 80 },
    supplierInvoiceNo: { type: String, default: null, trim: true, maxlength: 80 },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierName: { type: String, default: null, trim: true, maxlength: 200 },
    items: { type: [purchaseItemSchema], required: true },
    subtotal: { type: Number, required: true }, // integer paisa
    discountAmount: { type: Number, default: 0 }, // integer paisa
    taxAmount: { type: Number, default: 0 }, // integer paisa
    total: { type: Number, required: true }, // integer paisa
    paidAmount: { type: Number, default: 0 }, // integer paisa
    dueAmount: { type: Number, default: 0 }, // integer paisa
    paymentAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    paymentStatus: { type: String, enum: [...PURCHASE_PAYMENT_STATUSES], default: "UNPAID" },
    status: { type: String, enum: [...PURCHASE_STATUSES], default: "DRAFT" },
    notes: { type: String, default: null, trim: true, maxlength: 500 },
    purchaseDate: { type: Date, required: true, default: () => new Date() },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localId: { type: String, default: null, trim: true, maxlength: 80 },
    deviceId: { type: Schema.Types.ObjectId, ref: "Device", default: null },
  },
  { timestamps: true }
);

// Purchase numbers are unique within a business. Partial filter so the many
// DRAFT purchases with invoiceNo === null do not collide.
purchaseSchema.index(
  { businessId: 1, invoiceNo: 1 },
  { unique: true, partialFilterExpression: { invoiceNo: { $type: "string" } } }
);
// Offline-sync idempotency: one purchase per device-generated localId.
purchaseSchema.index(
  { businessId: 1, localId: 1 },
  { unique: true, partialFilterExpression: { localId: { $type: "string" } } }
);
// Tenant-scoped listing, newest first.
purchaseSchema.index({ businessId: 1, shopId: 1, purchaseDate: -1 });
// Supplier ledger / statement reads.
purchaseSchema.index({ businessId: 1, supplierId: 1, purchaseDate: -1 });
// Status dashboards (outstanding payables, drafts).
purchaseSchema.index({ businessId: 1, shopId: 1, status: 1, paymentStatus: 1 });

export const Purchase = model<PurchaseDocument>("Purchase", purchaseSchema);
