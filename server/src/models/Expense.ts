import { Schema, model, Document, Types } from "mongoose";

/**
 * Phase 05.06 — Expense.
 *
 * An expense moves money OUT of a payment Account. `amount` is integer
 * paisa (never floating point) and the authoritative balance change lives
 * on the Account document; this record is the source document that the
 * balanced JournalEntry references.
 *
 * Phase 12 — `category` is a validated string: the service accepts the
 * built-in enum UNION the business's custom categories (Business.
 * customExpenseCategories), so the mongoose-level enum is intentionally
 * absent. The journal account name derives from the category either way.
 */
export interface ExpenseDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  /** Built-in or business-custom category (service-validated). */
  category: string;
  /** Integer paisa. */
  amount: number;
  paymentAccountId: Types.ObjectId;
  note: string | null;
  receiptUrl: string | null;
  expenseDate: Date;
  createdBy: Types.ObjectId;
  localId: string | null;
  /**
   * The Device that originated this record (05.13). Snapshotted from the
   * verified access-token claims, never from the request body. Null for records
   * created by a session without device context.
   */
  deviceId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<ExpenseDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    category: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    amount: { type: Number, required: true }, // integer paisa
    paymentAccountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    note: { type: String, default: null, trim: true, maxlength: 500 },
    receiptUrl: { type: String, default: null, trim: true, maxlength: 500 },
    expenseDate: { type: Date, required: true, default: () => new Date() },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localId: { type: String, default: null, trim: true, maxlength: 80 },
    deviceId: { type: Schema.Types.ObjectId, ref: "Device", default: null },
  },
  { timestamps: true }
);

// Tenant-scoped listing, newest first.
expenseSchema.index({ businessId: 1, shopId: 1, expenseDate: -1 });
expenseSchema.index({ businessId: 1, expenseDate: -1 });
// Category reporting (Phase 07 P&L) and per-account expense history.
expenseSchema.index({ businessId: 1, category: 1 });
expenseSchema.index({ businessId: 1, paymentAccountId: 1 });
// Offline-sync idempotency: one expense per device-generated localId. The
// partial filter lets the many online expenses with localId === null coexist,
// and the uniqueness is what makes a retried offline expense resolve to the
// original instead of deducting the account twice.
expenseSchema.index(
  { businessId: 1, localId: 1 },
  { unique: true, partialFilterExpression: { localId: { $type: "string" } } }
);

export const Expense = model<ExpenseDocument>("Expense", expenseSchema);
