import { Schema, model, Document, Types } from "mongoose";

export type ProductStatus = "ACTIVE" | "INACTIVE";

/**
 * Phase 12 — product variant (S/M/L/XL, colour, pack size…).
 *
 * Variants are CATALOG metadata: they give a size its own name/price delta
 * and optionally its own barcode for scanner lookup. Stock stays at the
 * PRODUCT level (variants share the product's stock pool) so the verified
 * Phase 05–07 stock/journal engines remain untouched; `variantName` is
 * snapshotted onto sale lines for labelling only.
 */
export interface ProductVariant {
  /** e.g. "S", "M", "Red". Unique (case-insensitive) within the product. */
  name: string;
  sku: string | null;
  barcode: string | null;
  /** Integer paisa ADDED to Product.sellingPrice at sale entry time. */
  priceAdjustmentPaisa: number;
}

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
  variants: ProductVariant[];
  /** Phase 10 offline-sync idempotency anchor (see Customer.localId). */
  localId: string | null;
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
    variants: {
      type: [
        {
          name: { type: String, required: true, trim: true, maxlength: 40 },
          sku: { type: String, trim: true, default: null, maxlength: 60 },
          barcode: { type: String, trim: true, default: null, maxlength: 80 },
          priceAdjustmentPaisa: { type: Number, default: 0 }, // integer paisa
        },
      ],
      default: [],
    },
    localId: { type: String, default: null, trim: true, maxlength: 80 },
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
// Phase 10 offline-sync idempotency: one product per business-scoped localId.
productSchema.index(
  { businessId: 1, localId: 1 },
  { unique: true, partialFilterExpression: { localId: { $type: "string" } } }
);

export const Product = model<ProductDocument>("Product", productSchema);
