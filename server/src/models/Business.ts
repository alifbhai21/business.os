import { Schema, model, Document } from "mongoose";

export type BusinessType =
  | "retail"
  | "wholesale"
  | "retail_wholesale"
  | "service"
  | "distribution"
  | "manufacturing"
  | "restaurant"
  | "online"
  | "construction"
  | "other";

export const BUSINESS_TYPES: BusinessType[] = [
  "retail",
  "wholesale",
  "retail_wholesale",
  "service",
  "distribution",
  "manufacturing",
  "restaurant",
  "online",
  "construction",
  "other",
];

export type BusinessStatus = "ACTIVE" | "SUSPENDED";

export type BusinessSettings = {
  currency: string;
  taxRate: number;
  fiscalYear: string;
  allowNegativeStock: boolean;
};

export interface BusinessDocument extends BusinessSettings, Document {
  name: string;
  type: BusinessType;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
  /**
   * Phase 12 — business-defined expense categories (uppercased). Extend the
   * built-in EXPENSE_CATEGORIES at runtime without code changes; each maps to
   * its own journal expense account via the same naming rule.
   */
  customExpenseCategories: string[];
  status: BusinessStatus;
  createdAt: Date;
  updatedAt: Date;
}

const businessSchema = new Schema<BusinessDocument>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: BUSINESS_TYPES, default: "retail" },
    currency: { type: String, default: "BDT" },
    taxRate: { type: Number, required: true, default: 0 },
    fiscalYear: { type: String, default: "1 July - 30 June" },
    allowNegativeStock: { type: Boolean, default: false },
    address: { type: String, default: null },
    phone: { type: String, default: null },
    email: { type: String, default: null },
  logo: { type: String, default: null },
  customExpenseCategories: { type: [String], default: [] },
  status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE" },
  },
  { timestamps: true }
);

// Membership lookup dominates access; businessId is the tenant boundary.
export const Business = model<BusinessDocument>("Business", businessSchema);