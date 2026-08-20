import { BUSINESS_TYPES, BusinessType } from "../models/Business";

export { BUSINESS_TYPES };
export type { BusinessType };

export type ModuleKey =
  | "inventory"
  | "sales"
  | "purchases"
  | "customers"
  | "customer_due"
  | "suppliers"
  | "supplier_due"
  | "expenses"
  | "payments"
  | "accounting"
  | "reports";

/** PRD §8.2 — modules per business type (single source of truth, config-driven). */
export const MODULES_BY_TYPE: Record<BusinessType, ModuleKey[]> = {
  retail: ["inventory", "sales", "purchases", "customers", "customer_due", "suppliers", "supplier_due", "expenses", "payments", "accounting", "reports"],
  wholesale: ["inventory", "sales", "purchases", "customers", "customer_due", "suppliers", "supplier_due", "expenses", "payments", "accounting", "reports"],
  retail_wholesale: ["inventory", "sales", "purchases", "customers", "customer_due", "suppliers", "supplier_due", "expenses", "payments", "accounting", "reports"],
  service: ["customers", "sales", "payments", "expenses", "accounting", "reports"],
  distribution: ["inventory", "sales", "purchases", "customers", "customer_due", "suppliers", "supplier_due", "expenses", "payments", "accounting", "reports"],
  manufacturing: ["inventory", "sales", "purchases", "customers", "customer_due", "suppliers", "supplier_due", "expenses", "payments", "accounting", "reports"],
  restaurant: ["inventory", "sales", "purchases", "suppliers", "supplier_due", "expenses", "payments", "accounting", "reports"],
  online: ["inventory", "sales", "purchases", "customers", "customer_due", "suppliers", "supplier_due", "expenses", "payments", "accounting", "reports"],
  construction: ["inventory", "sales", "purchases", "customers", "customer_due", "suppliers", "supplier_due", "expenses", "payments", "accounting", "reports"],
  other: ["inventory", "sales", "purchases", "customers", "customer_due", "suppliers", "supplier_due", "expenses", "payments", "accounting", "reports"],
};

export function modulesForType(type: BusinessType): ModuleKey[] {
  return MODULES_BY_TYPE[type] ?? MODULES_BY_TYPE.other;
}

export function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === "string" && (BUSINESS_TYPES as string[]).includes(value);
}