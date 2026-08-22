import { Schema, model, Document, Types } from "mongoose";

/**
 * Phase 05 architecture decision #8: every financial transaction must
 * produce balanced debit/credit journal entries.
 *
 * A JournalEntry is the header for one balanced journal. The lines live
 * in the JournalLine collection. Reversals (voids) NEVER delete the
 * original — a new reversing entry is written that points back via
 * reversesEntryId.
 */
export const JOURNAL_REFERENCE_TYPES = [
  "SALE",
  "SALE_RETURN",
  "PURCHASE",
  "PURCHASE_RETURN",
  "PAYMENT",
  "EXPENSE",
  "REVERSAL",
] as const;
export type JournalReferenceType = (typeof JOURNAL_REFERENCE_TYPES)[number];

export interface JournalEntryDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  date: Date;
  description: string;
  referenceType: JournalReferenceType;
  referenceId: Types.ObjectId | null;
  isReversal: boolean;
  reversesEntryId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const journalEntrySchema = new Schema<JournalEntryDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    date: { type: Date, required: true, default: () => new Date() },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    referenceType: { type: String, enum: JOURNAL_REFERENCE_TYPES, required: true },
    referenceId: { type: Schema.Types.ObjectId, default: null },
    isReversal: { type: Boolean, default: false },
    reversesEntryId: { type: Schema.Types.ObjectId, default: null, ref: "JournalEntry" },
  },
  { timestamps: true }
);

// Tenant-scoped ledger lookups (general ledger by date).
journalEntrySchema.index({ businessId: 1, createdAt: 1 });
journalEntrySchema.index({ businessId: 1, shopId: 1, date: 1 });
// Efficient lookups by the source financial document.
journalEntrySchema.index({ referenceType: 1, referenceId: 1 });
// Reversal traceability.
journalEntrySchema.index({ reversesEntryId: 1 });

export const JournalEntry = model<JournalEntryDocument>("JournalEntry", journalEntrySchema);