import { Schema, model, Document, Types } from "mongoose";

export type CustomerStatus = "ACTIVE" | "INACTIVE";

export interface CustomerDocument extends Document {
  businessId: Types.ObjectId;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  customerCode: string | null;
  openingBalance: number; // paisa (positive = customer owes the business)
  creditLimit: number; // paisa
  currentDue: number; // paisa — opening balance + sales − payments (maintained by Phase 05+)
  status: CustomerStatus;
  /**
   * Phase 10 offline-sync idempotency anchor. Snapshotted from the client's
   * generated localId so a retried queued create can never duplicate a row.
   */
  localId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<CustomerDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    address: { type: String, default: null },
    customerCode: { type: String, trim: true, default: null },
    openingBalance: { type: Number, default: 0 }, // paisa
    creditLimit: { type: Number, default: 0 }, // paisa
    currentDue: { type: Number, default: 0 }, // paisa
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    localId: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { timestamps: true }
);

// Customers are always accessed within a business tenant.
customerSchema.index({ businessId: 1, name: 1 });
customerSchema.index({ businessId: 1, phone: 1 });
// Phase 10 offline-sync idempotency: one customer per business-scoped localId.
customerSchema.index(
  { businessId: 1, localId: 1 },
  { unique: true, partialFilterExpression: { localId: { $type: "string" } } }
);

export const Customer = model<CustomerDocument>("Customer", customerSchema);
