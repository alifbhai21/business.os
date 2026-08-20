import { Schema, model, Document, Types } from "mongoose";
import { JournalAccountType } from "../config/accounts";

export interface JournalLineDocument extends Document {
  entryId: Types.ObjectId;
  accountName: string;
  accountType: JournalAccountType;
  /** Integer paisa. Exactly one of debit/credit is non-zero. */
  debit: number;
  credit: number;
}

const journalLineSchema = new Schema<JournalLineDocument>(
  {
    entryId: { type: Schema.Types.ObjectId, ref: "JournalEntry", required: true },
    accountName: { type: String, required: true, trim: true, maxlength: 80 },
    accountType: {
      type: String,
      enum: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"],
      required: true,
    },
    debit: { type: Number, default: 0, min: 0 }, // integer paisa
    credit: { type: Number, default: 0, min: 0 }, // integer paisa
  },
  { timestamps: true }
);

// Ledger lookups by account within a business + date range.
journalLineSchema.index({ entryId: 1 });
journalLineSchema.index({ accountName: 1 });
// General Ledger by account type.
journalLineSchema.index({ accountType: 1 });

export const JournalLine = model<JournalLineDocument>("JournalLine", journalLineSchema);