import { Schema, model, Document, Types } from "mongoose";

export type ProductStatus = "ACTIVE" | "INACTIVE";

export interface ProductDocument extends Document {
  businessId: Types.ObjectId;
  categoryId: Types.ObjectId | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  unit: string;
  purchasePrice: number; // paisa
  sellingPrice: number; // paisa
  wholesalePrice: number; // paisa
  minPrice: number; // paisa
  taxRate: number; // percent (0–100)
  currentStock: number;
  minStock: number;
  maxStock: number;
  avgCost: number; // paisa — maintained by purchases (Phase 05+)
  preferredSupplierId: Types.ObjectId | null;
  imageUrl: string | null;
  description: string | null;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<ProductDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: null },
    barcode: { type: String, trim: true, default: null },
    brand: { type: String, trim: true, default: null },
    unit: { type: String, default: "piece" },
    purchasePrice: { type: Number, default: 0 }, // paisa
    sellingPrice: { type: Number, default: 0 }, // paisa
    wholesalePrice: { type: Number, default: 0 }, // paisa
    minPrice: { type: Number, default: 0 }, // paisa
    taxRate: { type: Number, default: 0 }, // percent
    currentStock: { type: Number, default: 0 },
    minStock: { type: Number, default: 0 },
    maxStock: { type: Number, default: 0 },
    avgCost: { type: Number, default: 0 }, // paisa
    preferredSupplierId: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    imageUrl: { type: String, default: null },
    description: { type: String, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

// Products are always accessed within a business tenant.
productSchema.index({ businessId: 1, name: 1 });
// Barcodes are unique within a business (a barcode identifies one product per business).
productSchema.index({ businessId: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: "string" } } });
productSchema.index({ businessId: 1, sku: 1 });
productSchema.index({ businessId: 1, categoryId: 1 });
productSchema.index({ businessId: 1, preferredSupplierId: 1 });

export const Product = model<ProductDocument>("Product", productSchema);
