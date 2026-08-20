import { Schema, model, Document, Types } from "mongoose";

export type SupplierStatus = "ACTIVE" | "INACTIVE";

export interface SupplierDocument extends Document {
  businessId: Types.ObjectId;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  address: string | null;
  openingBalance: number; // paisa (positive = the business owes the supplier)
  currentPayable: number; // paisa — opening balance + purchases − payments (maintained by Phase 05+)
  status: SupplierStatus;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<SupplierDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    company: { type: String, trim: true, default: null },
    address: { type: String, default: null },
    openingBalance: { type: Number, default: 0 }, // paisa
    currentPayable: { type: Number, default: 0 }, // paisa
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

// Suppliers are always accessed within a business tenant.
supplierSchema.index({ businessId: 1, name: 1 });
supplierSchema.index({ businessId: 1, phone: 1 });

export const Supplier = model<SupplierDocument>("Supplier", supplierSchema);
