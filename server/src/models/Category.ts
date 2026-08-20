import { Schema, model, Document, Types } from "mongoose";

export type CategoryStatus = "ACTIVE" | "INACTIVE";

export interface CategoryDocument extends Document {
  businessId: Types.ObjectId;
  name: string;
  description: string | null;
  status: CategoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

// Categories are always accessed within a business tenant.
// Category names are unique within a business (not global).
categorySchema.index({ businessId: 1, name: 1 }, { unique: true });

export const Category = model<CategoryDocument>("Category", categorySchema);
