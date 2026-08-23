import { Sale } from "../models/Sale";
import { Purchase } from "../models/Purchase";
import { Product } from "../models/Product";
import { Customer } from "../models/Customer";
import { Supplier } from "../models/Supplier";
import { membershipFor, escapeRegExp } from "./membership";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 08 - global search.
 *
 * A cross-collection LOOKUP utility (products, customers, suppliers, sale
 * invoices, purchase invoices) mirroring the read RBAC of those collections:
 * any ACTIVE member may search their own tenant. Results are always
 * business-scoped; sale/purchase hits are additionally shop-scoped for
 * shop-pinned members. Only operational fields are returned - no journals,
 * no account balances.
 */

const PER_TYPE_LIMIT = 5;
const MIN_TERM_LENGTH = 2;

export interface GlobalSearchResult {
  products: { id: string; name: string; sku: string | null; barcode: string | null; currentStock: number; sellingPrice: number }[];
  customers: { id: string; name: string; phone: string | null; customerCode: string | null; currentDue: number }[];
  suppliers: { id: string; name: string; phone: string | null; company: string | null; currentPayable: number }[];
  sales: { id: string; invoiceNo: string | null; status: string; total: number; customerName: string | null; saleDate: Date }[];
  purchases: { id: string; invoiceNo: string | null; status: string; total: number; supplierName: string | null; purchaseDate: Date }[];
}

export async function globalSearch(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  rawTerm: unknown
): Promise<GlobalSearchResult> {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  let effectiveShopId: string | null = shopId ?? null;
  if (shopId) {
    if (membership.shopId && String(membership.shopId) !== shopId) {
      throw ApiError.notFound("Shop not found");
    }
  } else if (membership.shopId) {
    effectiveShopId = String(membership.shopId);
  }

  const term = typeof rawTerm === "string" ? rawTerm.trim() : "";
  if (term.length < MIN_TERM_LENGTH) {
    throw ApiError.badRequest(`Search term must be at least ${MIN_TERM_LENGTH} characters`);
  }
  // Case-insensitive, escaped - never a user-controlled regex (ReDoS/injection).
  const rx = new RegExp(escapeRegExp(term), "i");

  const docScope = { businessId: membership.businessId };
  const txnScope = {
    businessId: membership.businessId,
    ...(effectiveShopId ? { shopId: effectiveShopId } : {}),
  };

  const [products, customers, suppliers, sales, purchases] = await Promise.all([
    Product.find(
      { ...docScope, $or: [{ name: rx }, { sku: rx }, { barcode: rx }] },
      { name: 1, sku: 1, barcode: 1, currentStock: 1, sellingPrice: 1 }
    )
      .sort({ name: 1 })
      .limit(PER_TYPE_LIMIT)
      .lean(),
    Customer.find(
      { ...docScope, $or: [{ name: rx }, { phone: rx }, { customerCode: rx }] },
      { name: 1, phone: 1, customerCode: 1, currentDue: 1 }
    )
      .sort({ name: 1 })
      .limit(PER_TYPE_LIMIT)
      .lean(),
    Supplier.find(
      { ...docScope, $or: [{ name: rx }, { phone: rx }, { company: rx }] },
      { name: 1, phone: 1, company: 1, currentPayable: 1 }
    )
      .sort({ name: 1 })
      .limit(PER_TYPE_LIMIT)
      .lean(),
    Sale.find(
      { ...txnScope, $or: [{ invoiceNo: rx }, { customerName: rx }] },
      { invoiceNo: 1, status: 1, total: 1, customerName: 1, saleDate: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(PER_TYPE_LIMIT)
      .lean(),
    Purchase.find(
      { ...txnScope, $or: [{ invoiceNo: rx }, { supplierInvoiceNo: rx }, { supplierName: rx }] },
      { invoiceNo: 1, status: 1, total: 1, supplierName: 1, purchaseDate: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(PER_TYPE_LIMIT)
      .lean(),
  ]);

  return {
    products: products.map((p) => ({
      id: String(p._id),
      name: p.name,
      sku: p.sku ?? null,
      barcode: p.barcode ?? null,
      currentStock: p.currentStock ?? 0,
      sellingPrice: p.sellingPrice ?? 0,
    })),
    customers: customers.map((c) => ({
      id: String(c._id),
      name: c.name,
      phone: c.phone ?? null,
      customerCode: c.customerCode ?? null,
      currentDue: c.currentDue ?? 0,
    })),
    suppliers: suppliers.map((s) => ({
      id: String(s._id),
      name: s.name,
      phone: s.phone ?? null,
      company: s.company ?? null,
      currentPayable: s.currentPayable ?? 0,
    })),
    sales: sales.map((s) => ({
      id: String(s._id),
      invoiceNo: s.invoiceNo ?? null,
      status: s.status,
      total: s.total,
      customerName: s.customerName ?? null,
      saleDate: s.saleDate,
    })),
    purchases: purchases.map((p) => ({
      id: String(p._id),
      invoiceNo: p.invoiceNo ?? null,
      status: p.status,
      total: p.total,
      supplierName: p.supplierName ?? null,
      purchaseDate: p.purchaseDate,
    })),
  };
}
