import { Schema, model, Document, Types } from "mongoose";

/**
 * PRD roles: Owner · Admin · Manager · Accountant · Salesperson
 * · Inventory Manager · Viewer
 */
export const ROLES = [
  "Owner",
  "Admin",
  "Manager",
  "Accountant",
  "Salesperson",
  "Inventory Manager",
  "Viewer",
] as const;

export type Role = (typeof ROLES)[number];
export type MembershipStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export interface BusinessMembershipDocument extends Document {
  userId: Types.ObjectId;
  businessId: Types.ObjectId;
  shopId: Types.ObjectId | null;
  role: Role;
  status: MembershipStatus;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const businessMembershipSchema = new Schema<BusinessMembershipDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
    role: { type: String, enum: ROLES, default: "Owner" },
    status: { type: String, enum: ["ACTIVE", "INVITED", "SUSPENDED"], default: "ACTIVE" },
    permissions: { type: [String], default: [] },
  },
  {
    timestamps: true,
  }
);

// Indexes for the dominant access pattern: which businesses can a user access?
businessMembershipSchema.index({ userId: 1, businessId: 1 });
businessMembershipSchema.index({ businessId: 1 });

export const BusinessMembership = model<BusinessMembershipDocument>(
  "BusinessMembership",
  businessMembershipSchema
);