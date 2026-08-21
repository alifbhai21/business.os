/**
 * Invoice serializer + read model (05.10).
 *
 * An invoice is a READ-ONLY projection of an already-finalized Sale or
 * Purchase. Nothing in this file allocates a number, writes a journal, touches
 * stock, moves money or mutates the source document. `invoiceNo` is whatever
 * the verified 05.07/05.08 finalizers stored — `INV-<fy>-<branch>-<seq>` for a
 * sale, `PUR-<fy>-<branch>-<seq>` for a purchase — reproduced verbatim. There
 * is deliberately no second numbering scheme and no counter read here.
 *
 * Tenant scope is delegated to the verified `getSale`/`getPurchase` readers, so
 * a foreign business or foreign shop resolves to the same 404 they already
 * return — an invoice can never leak the existence of another tenant's
 * document.
 */
import { Types } from "mongoose";
import { Sale, SaleStatus, SalePaymentStatus, SALE_STATUSES, PAYMENT_STATUSES } from "../models/Sale";
import {
  Purchase,
  PurchaseStatus,
  PurchasePaymentStatus,
  PURCHASE_STATUSES,
  PURCHASE_PAYMENT_STATUSES,
} from "../models/Purchase";
import { Business, BusinessDocument } from "../models/Business";
import { Shop, ShopDocument } from "../models/Shop";
import { Customer, CustomerDocument } from "../models/Customer";
import { Supplier, SupplierDocument } from "../models/Supplier";
import { getSale } from "./sale.service";
import { getPurchase } from "./purchase.service";
import { membershipFor } from "./membership";
import { parsePagination, buildPagination } from "../utils/pagination";
import { ApiError } from "../utils/ApiError";

export const INVOICE_TYPES = ["SALE", "PURCHASE"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

/** The verified public shapes — field names come from the source services. */
type PublicSale = Awaited<ReturnType<typeof getSale>>;
type PublicPurchase = Awaited<ReturnType<typeof getPurchase>>;

export interface InvoiceParty {
  kind: "CUSTOMER" | "SUPPLIER";
  id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  company: string | null;
}

export interface InvoiceBusiness {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
}

export interface InvoiceShop {
  id: string;
  name: string;
  branchCode: string;
  address: string | null;
  phone: string | null;
}

/**
 * A printable invoice line. Money stays integer paisa exactly as stored.
 * `netAmount` is the stored decomposition `lineTotal − taxAmount`, not a
 * re-derivation from qty × unitPrice, so it can never disagree with the source.
 */
export interface InvoiceLine {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  netAmount: number;
  lineTotal: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
}

export interface Invoice {
  type: InvoiceType;
  documentId: string;
  /** Exactly the value stored at finalization; null only for an unnumbered doc. */
  invoiceNo: string | null;
  /** The counterparty's own reference — purchases only, always null on a sale. */
  supplierInvoiceNo: string | null;
  status: SaleStatus | PurchaseStatus;
  paymentStatus: SalePaymentStatus | PurchasePaymentStatus;
  /** saleDate / purchaseDate of the source document. */
  date: Date;
  issuedAt: Date;
  currency: string;
  business: InvoiceBusiness;
  shop: InvoiceShop;
  counterparty: InvoiceParty;
  items: InvoiceLine[];
  totals: InvoiceTotals;
  notes: string | null;
}

/** Row shape for the invoice registers (`GET /invoices/sales|purchases`). */
export interface InvoiceSummary {
  type: InvoiceType;
  documentId: string;
  invoiceNo: string | null;
  status: SaleStatus | PurchaseStatus;
  paymentStatus: SalePaymentStatus | PurchasePaymentStatus;
  date: Date;
  currency: string;
  counterpartyName: string | null;
  total: number;
  paidAmount: number;
  dueAmount: number;
}

export interface ListInvoicesQuery {
  page?: unknown;
  limit?: unknown;
  status?: unknown;
  paymentStatus?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
}

function serializeBusiness(b: BusinessDocument): InvoiceBusiness {
  return {
    id: String(b._id),
    name: b.name,
    address: b.address,
    phone: b.phone,
    email: b.email,
    logo: b.logo,
  };
}

function serializeShop(s: ShopDocument): InvoiceShop {
  return {
    id: String(s._id),
    name: s.name,
    branchCode: s.branchCode,
    address: s.address,
    phone: s.phone,
  };
}

/**
 * Counterparty block. The document's own snapshotted name wins over the live
 * record so a later rename cannot rewrite an issued invoice; contact details
 * come from the record because they are not snapshotted anywhere.
 *
 * A walk-in sale (customerId === null) yields a party with a null id and the
 * walk-in name the sale carries.
 */
function serializeCustomer(
  snapshotName: string | null,
  customer: CustomerDocument | null
): InvoiceParty {
  return {
    kind: "CUSTOMER",
    id: customer ? String(customer._id) : null,
    name: snapshotName ?? customer?.name ?? null,
    phone: customer?.phone ?? null,
    email: customer?.email ?? null,
    address: customer?.address ?? null,
    company: null,
  };
}

function serializeSupplier(
  snapshotName: string | null,
  supplier: SupplierDocument | null
): InvoiceParty {
  return {
    kind: "SUPPLIER",
    id: supplier ? String(supplier._id) : null,
    name: snapshotName ?? supplier?.name ?? null,
    phone: supplier?.phone ?? null,
    email: supplier?.email ?? null,
    address: supplier?.address ?? null,
    company: supplier?.company ?? null,
  };
}

/**
 * Sale lines. `costPrice` is deliberately NOT projected: an invoice is the
 * document shared with the buyer, and the margin snapshot Phase 07 reads from
 * the Sale is internal. Everything else is copied through untouched.
 */
function serializeSaleLines(sale: PublicSale): InvoiceLine[] {
  return sale.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    qty: item.qty,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    taxAmount: item.taxAmount,
    netAmount: item.lineTotal - item.taxAmount,
    lineTotal: item.lineTotal,
  }));
}

/**
 * Purchase lines. `costAmount` and `netUnitCost` stay internal — they are the
 * weighted-average-cost machinery of 05.08, not bill presentation.
 */
function serializePurchaseLines(purchase: PublicPurchase): InvoiceLine[] {
  return purchase.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    qty: item.qty,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    taxAmount: item.taxAmount,
    netAmount: item.lineTotal - item.taxAmount,
    lineTotal: item.lineTotal,
  }));
}

/**
 * Pure, deterministic projection of a finalized sale. No I/O, no mutation of
 * any argument, no arithmetic beyond the stored decomposition of a line.
 */
export function serializeSaleInvoice(
  sale: PublicSale,
  business: BusinessDocument,
  shop: ShopDocument,
  customer: CustomerDocument | null
): Invoice {
  return {
    type: "SALE",
    documentId: sale.id,
    invoiceNo: sale.invoiceNo,
    supplierInvoiceNo: null,
    status: sale.status,
    paymentStatus: sale.paymentStatus,
    date: sale.saleDate,
    issuedAt: sale.createdAt,
    currency: business.currency,
    business: serializeBusiness(business),
    shop: serializeShop(shop),
    counterparty: serializeCustomer(sale.customerName, customer),
    items: serializeSaleLines(sale),
    totals: {
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      taxAmount: sale.taxAmount,
      total: sale.total,
      paidAmount: sale.paidAmount,
      dueAmount: sale.dueAmount,
    },
    notes: sale.notes,
  };
}

/** Pure, deterministic projection of a finalized purchase. */
export function serializePurchaseInvoice(
  purchase: PublicPurchase,
  business: BusinessDocument,
  shop: ShopDocument,
  supplier: SupplierDocument | null
): Invoice {
  return {
    type: "PURCHASE",
    documentId: purchase.id,
    invoiceNo: purchase.invoiceNo,
    supplierInvoiceNo: purchase.supplierInvoiceNo,
    status: purchase.status,
    paymentStatus: purchase.paymentStatus,
    date: purchase.purchaseDate,
    issuedAt: purchase.createdAt,
    currency: business.currency,
    business: serializeBusiness(business),
    shop: serializeShop(shop),
    counterparty: serializeSupplier(purchase.supplierName, supplier),
    items: serializePurchaseLines(purchase),
    totals: {
      subtotal: purchase.subtotal,
      discountAmount: purchase.discountAmount,
      taxAmount: purchase.taxAmount,
      total: purchase.total,
      paidAmount: purchase.paidAmount,
      dueAmount: purchase.dueAmount,
    },
    notes: purchase.notes,
  };
}

/**
 * `sale` / `sales` / `purchase` / `purchases`, case-insensitive. An unknown type
 * is 404 rather than 400 — the URL simply does not address an invoice, and a
 * 400 would confirm the path shape to a prober.
 */
export function normalizeInvoiceType(raw: string): InvoiceType {
  const v = raw.trim().toUpperCase();
  if (v === "SALE" || v === "SALES") return "SALE";
  if (v === "PURCHASE" || v === "PURCHASES") return "PURCHASE";
  throw ApiError.notFound("Invoice not found");
}

/**
 * An invoice exists only once the document has been finalized — a DRAFT has no
 * invoiceNo (05.07/05.08 allocate it inside the finalize transaction), so
 * asking for its invoice is a state error on a document the caller can see,
 * reported the same way 05.09 reports "only a completed sale can be voided".
 * VOIDED documents DO have an invoice: it is returned with status VOIDED and
 * the original number intact, because a voided invoice is still a fact.
 */
function assertIssued(status: SaleStatus | PurchaseStatus, kind: "sale" | "purchase"): void {
  if (status === "DRAFT") {
    throw ApiError.badRequest(`A draft ${kind} has no invoice yet`);
  }
}

async function loadHeader(
  businessId: string,
  shopId: string
): Promise<{ business: BusinessDocument; shop: ShopDocument }> {
  const [business, shop] = await Promise.all([
    Business.findById(new Types.ObjectId(businessId)),
    Shop.findOne({
      _id: new Types.ObjectId(shopId),
      businessId: new Types.ObjectId(businessId),
    }),
  ]);
  if (!business) throw ApiError.notFound("Business not found");
  if (!shop) throw ApiError.notFound("Shop not found");
  return { business, shop };
}

export async function getSaleInvoice(
  userId: string,
  businessId: string,
  shopId: string,
  saleId: string
): Promise<Invoice> {
  // Access, tenant/shop scope and the 404 contract are the verified reader's.
  const sale = await getSale(userId, businessId, shopId, saleId);
  assertIssued(sale.status, "sale");
  const { business, shop } = await loadHeader(sale.businessId, sale.shopId);
  const customer = sale.customerId
    ? await Customer.findOne({
        _id: new Types.ObjectId(sale.customerId),
        businessId: new Types.ObjectId(sale.businessId),
      })
    : null;
  return serializeSaleInvoice(sale, business, shop, customer);
}

export async function getPurchaseInvoice(
  userId: string,
  businessId: string,
  shopId: string,
  purchaseId: string
): Promise<Invoice> {
  const purchase = await getPurchase(userId, businessId, shopId, purchaseId);
  assertIssued(purchase.status, "purchase");
  const { business, shop } = await loadHeader(purchase.businessId, purchase.shopId);
  const supplier = await Supplier.findOne({
    _id: new Types.ObjectId(purchase.supplierId),
    businessId: new Types.ObjectId(purchase.businessId),
  });
  return serializePurchaseInvoice(purchase, business, shop, supplier);
}

export async function getInvoice(
  userId: string,
  businessId: string,
  shopId: string,
  rawType: string,
  documentId: string
): Promise<Invoice> {
  return normalizeInvoiceType(rawType) === "SALE"
    ? getSaleInvoice(userId, businessId, shopId, documentId)
    : getPurchaseInvoice(userId, businessId, shopId, documentId);
}

/**
 * Read scope for the registers. Mirrors `listSales`/`listPurchases`: an explicit
 * shopId must match a shop-pinned membership, and a business-wide membership
 * that supplies none lists every shop it owns.
 */
async function resolveReadScope(
  userId: string,
  businessId: string,
  shopId: string | null | undefined
): Promise<string | null> {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (shopId) {
    if (membership.shopId && String(membership.shopId) !== shopId) {
      throw ApiError.notFound("Shop not found");
    }
    return shopId;
  }
  return membership.shopId ? String(membership.shopId) : null;
}

/**
 * Register filter. DRAFTs are excluded structurally — an invoice register lists
 * issued documents, and a DRAFT has no number to list. `invoiceNo` must be a
 * string, which is exactly the predicate of the unique partial index.
 */
function buildRegisterFilter(
  businessId: string,
  effectiveShopId: string | null,
  dateField: "saleDate" | "purchaseDate",
  statuses: readonly string[],
  paymentStatuses: readonly string[],
  query: ListInvoicesQuery
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    businessId: new Types.ObjectId(businessId),
    status: { $ne: "DRAFT" },
    invoiceNo: { $type: "string" },
  };
  if (effectiveShopId) filter.shopId = new Types.ObjectId(effectiveShopId);
  if (
    typeof query.status === "string" &&
    query.status !== "DRAFT" &&
    statuses.includes(query.status)
  ) {
    filter.status = query.status;
  }
  if (typeof query.paymentStatus === "string" && paymentStatuses.includes(query.paymentStatus)) {
    filter.paymentStatus = query.paymentStatus;
  }
  const range: Record<string, Date> = {};
  if (typeof query.dateFrom === "string") {
    const from = new Date(query.dateFrom);
    if (!Number.isNaN(from.getTime())) range.$gte = from;
  }
  if (typeof query.dateTo === "string") {
    const to = new Date(query.dateTo);
    if (!Number.isNaN(to.getTime())) range.$lte = to;
  }
  if (Object.keys(range).length > 0) filter[dateField] = range;
  return filter;
}

export async function listSaleInvoices(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ListInvoicesQuery = {}
): Promise<{ items: InvoiceSummary[]; pagination: ReturnType<typeof buildPagination> }> {
  const effectiveShopId = await resolveReadScope(userId, businessId, shopId);
  const business = await Business.findById(new Types.ObjectId(businessId));
  if (!business) throw ApiError.notFound("Business not found");

  const filter = buildRegisterFilter(
    businessId,
    effectiveShopId,
    "saleDate",
    SALE_STATUSES,
    PAYMENT_STATUSES,
    query
  );
  const pagination = parsePagination(query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    Sale.countDocuments(filter),
    Sale.find(filter)
      .sort({ saleDate: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  const items: InvoiceSummary[] = rows.map((s) => ({
    type: "SALE",
    documentId: String(s._id),
    invoiceNo: s.invoiceNo,
    status: s.status,
    paymentStatus: s.paymentStatus,
    date: s.saleDate,
    currency: business.currency,
    counterpartyName: s.customerName,
    total: s.total,
    paidAmount: s.paidAmount,
    dueAmount: s.dueAmount,
  }));
  return { items, pagination: buildPagination(total, pagination) };
}

export async function listPurchaseInvoices(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ListInvoicesQuery = {}
): Promise<{ items: InvoiceSummary[]; pagination: ReturnType<typeof buildPagination> }> {
  const effectiveShopId = await resolveReadScope(userId, businessId, shopId);
  const business = await Business.findById(new Types.ObjectId(businessId));
  if (!business) throw ApiError.notFound("Business not found");

  const filter = buildRegisterFilter(
    businessId,
    effectiveShopId,
    "purchaseDate",
    PURCHASE_STATUSES,
    PURCHASE_PAYMENT_STATUSES,
    query
  );
  const pagination = parsePagination(query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    Purchase.countDocuments(filter),
    Purchase.find(filter)
      .sort({ purchaseDate: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  const items: InvoiceSummary[] = rows.map((p) => ({
    type: "PURCHASE",
    documentId: String(p._id),
    invoiceNo: p.invoiceNo,
    status: p.status,
    paymentStatus: p.paymentStatus,
    date: p.purchaseDate,
    currency: business.currency,
    counterpartyName: p.supplierName,
    total: p.total,
    paidAmount: p.paidAmount,
    dueAmount: p.dueAmount,
  }));
  return { items, pagination: buildPagination(total, pagination) };
}
