import { Schema, model, Document, Types } from "mongoose";

/**
 * Phase 09 — Employee (staff directory) record.
 *
 * An Employee is the business-scoped staff entry. When the invited phone
 * belongs to an existing User account, `userId` links the account and an
 * ACTIVE BusinessMembership is created/updated so RBAC applies immediately.
 * When no User exists yet, the Employee stays INVITED (no membership, no
 * access) until the person registers with that phone and an owner links them.
 *
 * Employees are never hard-deleted (audit trail + financial references):
 * removal is a soft transition to REMOVED and suspends the membership.
 */
export type EmployeeStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED";

export interface EmployeeDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId | null;
  userId: Types.ObjectId | null;
  name: string;
  phone: string;
  role: string;
  status: EmployeeStatus;
  invitedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const employeeSchema = new Schema<EmployeeDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    role: { type: String, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"],
      default: "INVITED",
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// One employee record per phone per business (REMOVED records keep history,
// so uniqueness only applies to live records via a partial index).
// NOTE: partialFilterExpression cannot express $ne — MongoDB only supports
// equality/$exists/comparison/$type/top-level $and (+$in since 6.0). Listing
// the live statuses explicitly builds the same uniqueness domain.
employeeSchema.index(
  { businessId: 1, phone: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["ACTIVE", "INVITED", "SUSPENDED"] } },
  }
);
employeeSchema.index({ businessId: 1, status: 1 });
employeeSchema.index({ businessId: 1, userId: 1 });

export const Employee = model<EmployeeDocument>("Employee", employeeSchema);