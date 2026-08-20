import { Schema, model, Document, Types } from "mongoose";

export type ShopStatus = "ACTIVE" | "INACTIVE";

export interface ShopDocument extends Document {
  businessId: Types.ObjectId;
  name: string;
  branchCode: string;
  address: string | null;
  phone: string | null;
  manager: string | null;
  isWarehouse: boolean;
  openingCash: number;
  status: ShopStatus;
  createdAt: Date;
  updatedAt: Date;
}

const shopSchema = new Schema<ShopDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true, trim: true },
    branchCode: { type: String, required: true, trim: true },
    address: { type: String, default: null },
    phone: { type: String, default: null },
    manager: { type: String, default: null },
    isWarehouse: { type: Boolean, default: false },
    openingCash: { type: Number, default: 0 }, // paisa
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

// Shop is always accessed within a business tenant.
shopSchema.index({ businessId: 1 });
// Branch code is unique within the business only (not global).
shopSchema.index({ businessId: 1, branchCode: 1 }, { unique: true });

export const Shop = model<ShopDocument>("Shop", shopSchema);