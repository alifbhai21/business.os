import { Schema, model, Document, Types } from "mongoose";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "../config/accounts";

/**
 * Phase 05.06 — Expense.
 *
 * An expense moves money OUT of a payment Account. `amount` is integer
 * paisa (never floating point) and the authoritative balance change lives
 * on the Account document; this record is the source document that the
 * balanced JournalEntry references.
 */
export interface ExpenseDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  category: ExpenseCategory;
  /** Integer paisa. */
  amount: number;
  paymentAccountId: Types.ObjectId;
  note: string | null;
  receiptUrl: string | null;
  expenseDate: Date;
  createdBy: Types.ObjectId;
  localId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<ExpenseDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    category: { type: String, enum: [...EXPENSE_CATEGORIES], required: true },
    amount: { type: Number, required: true }, // integer paisa
    paymentAccountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    note: { type: String, default: null, trim: true, maxlength: 500 },
    receiptUrl: { type: String, default: null, trim: true, maxlength: 500 },
    expenseDate: { type: Date, required: true, default: () => new Date() },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localId: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { timestamps: true }
);

// Tenant-scoped listing, newest first.
expenseSchema.index({ businessId: 1, shopId: 1, expenseDate: -1 });
expenseSchema.index({ businessId: 1, expenseDate: -1 });
// Category reporting (Phase 07 P&L) and per-account expense history.
expenseSchema.index({ businessId: 1, category: 1 });
expenseSchema.index({ businessId: 1, paymentAccountId: 1 });
// Offline sync lookup by device-generated id.
expenseSchema.index({ businessId: 1, localId: 1 });

export const Expense = model<ExpenseDocument>("Expense", expenseSchema);
