export const colors = {
  primary: "#2563EB",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  text: "#0F172A",
  textMuted: "#64748B",
  danger: "#DC2626",
  success: "#16A34A",
  chipBg: "#EFF6FF",
};

import type { Lang } from "./i18n/dictionaries";

export const businessTypes = [
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
] as const;

export const typeLabels: Record<string, Record<Lang, string>> = {
  retail: { bn: "খুচরা", en: "Retail" },
  wholesale: { bn: "পাইকারি", en: "Wholesale" },
  retail_wholesale: { bn: "খুচরা + পাইকারি", en: "Retail + Wholesale" },
  service: { bn: "সেবা", en: "Service" },
  distribution: { bn: "বিতরণ", en: "Distribution" },
  manufacturing: { bn: "উৎপাদন", en: "Manufacturing" },
  restaurant: { bn: "রেস্টুরেন্ট", en: "Restaurant" },
  online: { bn: "অনলাইন ব্যবসা", en: "Online Business" },
  construction: { bn: "নির্মাণ", en: "Construction" },
  other: { bn: "অন্যান্য", en: "Other" },
};

export const moduleLabels: Record<string, Record<Lang, string>> = {
  inventory: { bn: "স্টক/ইনভেন্টরি", en: "Inventory" },
  sales: { bn: "বিক্রয়", en: "Sales" },
  purchases: { bn: "ক্রয়", en: "Purchases" },
  customer_due: { bn: "কাস্টমার বাকি", en: "Customer Dues" },
  supplier_due: { bn: "সাপ্লায়ার বাকি", en: "Supplier Dues" },
  expenses: { bn: "খরচ", en: "Expenses" },
  accounting: { bn: "হিসাবরক্ষণ", en: "Accounting" },
  reports: { bn: "রিপোর্ট", en: "Reports" },
  customers: { bn: "কাস্টমার", en: "Customers" },
  services: { bn: "সেবা", en: "Services" },
  jobs: { bn: "জব/অর্ডার", en: "Jobs/Orders" },
  payments: { bn: "পেমেন্ট", en: "Payments" },
};