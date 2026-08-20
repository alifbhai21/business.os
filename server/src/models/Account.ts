import { Schema, model, Document, Types } from "mongoose";
import { ACCOUNT_TYPES, AccountType } from "../config/accounts";

export interface AccountDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  name: string;
  type: AccountType;
  accountNumber: string | null;
  /** Authoritative financial balance — integer paisa. */
  currentBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

const accountSchema = new Schema<AccountDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: ACCOUNT_TYPES, required: true },
    accountNumber: { type: String, default: null, trim: true, maxlength: 60 },
    currentBalance: { type: Number, default: 0 }, // integer paisa
  },
  { timestamps: true }
);

// Account names are unique within (business, shop) — one "Cash" per shop.
accountSchema.index({ businessId: 1, shopId: 1, name: 1 }, { unique: true });
// Balance lookups and default-cash lookup.
accountSchema.index({ businessId: 1, shopId: 1 });
// Filter accounts by type within a shop (e.g. list bank accounts).
accountSchema.index({ businessId: 1, shopId: 1, type: 1 });

export const Account = model<AccountDocument>("Account", accountSchema);