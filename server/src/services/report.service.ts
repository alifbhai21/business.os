import { Types } from "mongoose";
import { Sale } from "../models/Sale";
import { Purchase } from "../models/Purchase";
import { Expense } from "../models/Expense";
import { Product } from "../models/Product";
import { Customer } from "../models/Customer";
import { Supplier } from "../models/Supplier";
import * as accountingService from "./accounting.service";
import { membershipFor } from "./membership";
import { parsePagination, buildPagination, type PaginationParams } from "../utils/pagination";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 08 - server-authoritative reports.
 *
 * Every figure is computed on the SERVER from the verified Phase 05/06
 * transactional documents and (for profit-loss) the verified Phase 07
 * journal engine. The client never derives financial truth.
 *
 * Scope rules mirror accounting.service.resolveScope: tenant-scoped always,
 * shop-pinned memberships are pinned server-side; a shop-pinned member can
 * never widen their own scope by passing another shopId (404).
 *
 * Sales/purchase reports aggregate COMPLETED documents only - DRAFT carries
 * no financial effect and VOIDED was reversed. Product/customer group keys
 * use the SNAPSHOTTED names on each document so later renames never rewrite
 * history. Line-level sales figures are gross of later returns; net truth
 * (returns as contra entries) lives in /reports/profit-loss which delegates
 * to the journal engine.
 */

const oid = (id: string) => new Types.ObjectId(id);

export interface ReportQuery {
  from?: unknown;
  to?: unknown;
  page?: unknown;
  limit?: unknown;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate access + build the tenant/shop/date filter for one collection. */
async function scopedFilter(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery,
  dateField: "saleDate" | "purchaseDate" | "expenseDate"
): Promise<Record<string, unknown>> {
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

  const filter: Record<string, unknown> = { businessId: oid(businessId) };
  if (effectiveShopId) filter.shopId = oid(effectiveShopId);

  const range: Record<string, unknown> = {};
  let fromDate: Date | null = null;
  if (typeof query.from === "string" && query.from) {
    fromDate = new Date(query.from);
    if (Number.isNaN(fromDate.getTime())) throw ApiError.badRequest("Invalid from date");
    range.$gte = fromDate;
  }
  if (typeof query.to === "string" && query.to) {
    const d = new Date(query.to);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest("Invalid from date");
    // A bare YYYY-MM-DD "to" means the whole of that UTC day (reports bucket
    // by UTC days, so the bound must be UTC-midnight-to-UTC-midnight — a
    // local setHours() here truncates the evening in UTC+ timezones).
    if (DAY_RE.test(query.to)) d.setTime(d.getTime() + 86_400_000 - 1);
    range.$lte = d;
  }
  if (fromDate && range.$lte instanceof Date && fromDate > range.$lte) {
    throw ApiError.badRequest("from date must not be after to date");
  }
  if (Object.keys(range).length) filter[dateField] = range;

  return filter;
}

function paginationOf(query: ReportQuery): PaginationParams {
  return parsePagination(query as Record<string, unknown>);
}

// ── Sales report ───────────────────────────────────────────────────────────

const SALES_GROUP_BYS = ["daily", "monthly", "product", "customer"] as const;
export type SalesGroupBy = (typeof SALES_GROUP_BYS)[number];

export async function salesReport(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery & { groupBy?: unknown }
) {
  const groupBy =
    typeof query.groupBy === "string" && (SALES_GROUP_BYS as readonly string[]).includes(query.groupBy)
      ? (query.groupBy as SalesGroupBy)
      : null;
  if (!groupBy) {
    throw ApiError.badRequest(`groupBy must be one of: ${SALES_GROUP_BYS.join(", ")}`);
  }

  const filter = {
    ...(await scopedFilter(userId, businessId, shopId, query, "saleDate")),
    status: "COMPLETED",
  };

  if (groupBy === "daily" || groupBy === "monthly") {
    const fmt = groupBy === "monthly" ? "%Y-%m" : "%Y-%m-%d";
    const items = await Sale.aggregate<Record<string, number | string>>([
      { $match: filter },
      {
        $group: {
          _id: { key: { $dateToString: { format: fmt, date: "$saleDate" } } },
          count: { $sum: 1 },
          total: { $sum: "$total" },
          paid: { $sum: "$paidAmount" },
          due: { $sum: "$dueAmount" },
        },
      },
      { $sort: { "_id.key": 1 } },
      { $project: { _id: 0, key: "$_id.key", count: 1, total: 1, paid: 1, due: 1 } },
    ]);
    return { groupBy, items };
  }

  const pagination = paginationOf(query);

  if (groupBy === "product") {
    const [faceted] = await Sale.aggregate<Record<string, unknown>>([
      { $match: filter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          productName: { $first: "$items.productName" },
          qtySold: { $sum: "$items.qty" },
          returnedQty: { $sum: "$items.returnedQty" },
          salesTotal: { $sum: "$items.lineTotal" },
          taxTotal: { $sum: "$items.taxAmount" },
          costTotal: { $sum: { $multiply: ["$items.qty", "$items.costPrice"] } },
        },
      },
      {
        $addFields: {
          netRevenue: { $subtract: ["$salesTotal", "$taxTotal"] },
          grossProfit: {
            $subtract: [{ $subtract: ["$salesTotal", "$taxTotal"] }, "$costTotal"],
          },
        },
      },
      { $sort: { salesTotal: -1, _id: 1 } },
      {
        $facet: {
          rows: [
            { $skip: pagination.skip },
            { $limit: pagination.limit },
            {
              $project: {
                _id: 0,
                productId: { $toString: "$_id" },
                productName: 1,
                qtySold: 1,
                returnedQty: 1,
                salesTotal: 1,
                taxTotal: 1,
                netRevenue: 1,
                costTotal: 1,
                grossProfit: 1,
              },
            },
          ],
          total: [{ $count: "total" }],
        },
      },
    ]);
    const totalRow = (faceted?.total as { total: number }[] | undefined) ?? [];
    return {
      groupBy,
      items: faceted?.rows ?? [],
      pagination: buildPagination(totalRow[0]?.total ?? 0, pagination),
    };
  }

  // customer - walk-in sales share one bucket with customerId === null.
  const [faceted] = await Sale.aggregate<Record<string, unknown>>([
    { $match: filter },
    {
      $group: {
        _id: "$customerId",
        customerName: { $first: "$customerName" },
        count: { $sum: 1 },
        total: { $sum: "$total" },
        paid: { $sum: "$paidAmount" },
        due: { $sum: "$dueAmount" },
      },
    },
    { $sort: { total: -1, _id: 1 } },
    {
      $facet: {
        rows: [
          { $skip: pagination.skip },
          { $limit: pagination.limit },
          {
            $project: {
              _id: 0,
              customerId: {
                $cond: [{ $gt: ["$_id", null] }, { $toString: "$_id" }, null],
              },
              customerName: 1,
              count: 1,
              total: 1,
              paid: 1,
              due: 1,
            },
          },
        ],
        total: [{ $count: "total" }],
      },
    },
  ]);
  const totalRow = (faceted?.total as { total: number }[] | undefined) ?? [];
  return {
    groupBy,
    items: faceted?.rows ?? [],
    pagination: buildPagination(totalRow[0]?.total ?? 0, pagination),
  };
}

// ── Purchase report ────────────────────────────────────────────────────────

const PURCHASE_GROUP_BYS = ["daily", "monthly", "product", "supplier"] as const;
export type PurchaseGroupBy = (typeof PURCHASE_GROUP_BYS)[number];

export async function purchasesReport(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery & { groupBy?: unknown }
) {
  const groupBy =
    typeof query.groupBy === "string" &&
    (PURCHASE_GROUP_BYS as readonly string[]).includes(query.groupBy)
      ? (query.groupBy as PurchaseGroupBy)
      : null;
  if (!groupBy) {
    throw ApiError.badRequest(`groupBy must be one of: ${PURCHASE_GROUP_BYS.join(", ")}`);
  }

  const filter = {
    ...(await scopedFilter(userId, businessId, shopId, query, "purchaseDate")),
    status: "COMPLETED",
  };

  if (groupBy === "daily" || groupBy === "monthly") {
    const fmt = groupBy === "monthly" ? "%Y-%m" : "%Y-%m-%d";
    const items = await Purchase.aggregate<Record<string, number | string>>([
      { $match: filter },
      {
        $group: {
          _id: { key: { $dateToString: { format: fmt, date: "$purchaseDate" } } },
          count: { $sum: 1 },
          total: { $sum: "$total" },
          paid: { $sum: "$paidAmount" },
          due: { $sum: "$dueAmount" },
        },
      },
      { $sort: { "_id.key": 1 } },
      { $project: { _id: 0, key: "$_id.key", count: 1, total: 1, paid: 1, due: 1 } },
    ]);
    return { groupBy, items };
  }

  const pagination = paginationOf(query);

  if (groupBy === "product") {
    const [faceted] = await Purchase.aggregate<Record<string, unknown>>([
      { $match: filter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          productName: { $first: "$items.productName" },
          qtyPurchased: { $sum: "$items.qty" },
          returnedQty: { $sum: "$items.returnedQty" },
          purchasesTotal: { $sum: "$items.lineTotal" },
          costTotal: { $sum: "$items.costAmount" },
        },
      },
      { $sort: { purchasesTotal: -1, _id: 1 } },
      {
        $facet: {
          rows: [
            { $skip: pagination.skip },
            { $limit: pagination.limit },
            {
              $project: {
                _id: 0,
                productId: { $toString: "$_id" },
                productName: 1,
                qtyPurchased: 1,
                returnedQty: 1,
                purchasesTotal: 1,
                costTotal: 1,
              },
            },
          ],
          total: [{ $count: "total" }],
        },
      },
    ]);
    const totalRow = (faceted?.total as { total: number }[] | undefined) ?? [];
    return {
      groupBy,
      items: faceted?.rows ?? [],
      pagination: buildPagination(totalRow[0]?.total ?? 0, pagination),
    };
  }

  // supplier
  const [faceted] = await Purchase.aggregate<Record<string, unknown>>([
    { $match: filter },
    {
      $group: {
        _id: "$supplierId",
        supplierName: { $first: "$supplierName" },
        count: { $sum: 1 },
        total: { $sum: "$total" },
        paid: { $sum: "$paidAmount" },
        due: { $sum: "$dueAmount" },
      },
    },
    { $sort: { total: -1, _id: 1 } },
    {
      $facet: {
        rows: [
          { $skip: pagination.skip },
          { $limit: pagination.limit },
          {
            $project: {
              _id: 0,
              supplierId: { $toString: "$_id" },
              supplierName: 1,
              count: 1,
              total: 1,
              paid: 1,
              due: 1,
            },
          },
        ],
        total: [{ $count: "total" }],
      },
    },
  ]);
  const totalRow = (faceted?.total as { total: number }[] | undefined) ?? [];
  return {
    groupBy,
    items: faceted?.rows ?? [],
    pagination: buildPagination(totalRow[0]?.total ?? 0, pagination),
  };
}

// ── Inventory report ───────────────────────────────────────────────────────

/**
 * Current stock + valuation. Products are business-level in this schema, so
 * stock figures are business-wide even for shop-pinned members (documented
 * limitation, same as the dashboard). Low-stock uses the exact predicate of
 * inventory.service.listStock.
 */
export async function inventoryReport(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (shopId && membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }

  const match = { businessId: oid(businessId) };

  const [summaryAgg] = await Product.aggregate<Record<string, number>>([
    { $match: match },
    {
      $group: {
        _id: null,
        productCount: { $sum: 1 },
        totalUnits: { $sum: "$currentStock" },
        stockValue: { $sum: { $multiply: ["$currentStock", "$avgCost"] } },
        retailValue: { $sum: { $multiply: ["$currentStock", "$sellingPrice"] } },
        lowStockCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ["$minStock", 0] },
                  { $lte: ["$currentStock", "$minStock"] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const pagination = paginationOf(query);
  const [faceted] = await Product.aggregate<Record<string, unknown>>([
    { $match: match },
    { $sort: { name: 1, _id: 1 } },
    {
      $facet: {
        rows: [
          { $skip: pagination.skip },
          { $limit: pagination.limit },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              sku: 1,
              unit: 1,
              currentStock: 1,
              minStock: 1,
              avgCost: 1,
              sellingPrice: 1,
              stockValue: { $multiply: ["$currentStock", "$avgCost"] },
              retailValue: { $multiply: ["$currentStock", "$sellingPrice"] },
              lowStock: {
                $and: [{ $gt: ["$minStock", 0] }, { $lte: ["$currentStock", "$minStock"] }],
              },
            },
          },
        ],
        total: [{ $count: "total" }],
      },
    },
  ]);
  const totalRow = (faceted?.total as { total: number }[] | undefined) ?? [];

  return {
    summary: {
      productCount: summaryAgg?.productCount ?? 0,
      totalUnits: summaryAgg?.totalUnits ?? 0,
      stockValue: summaryAgg?.stockValue ?? 0,
      retailValue: summaryAgg?.retailValue ?? 0,
      lowStockCount: summaryAgg?.lowStockCount ?? 0,
    },
    items: faceted?.rows ?? [],
    pagination: buildPagination(totalRow[0]?.total ?? 0, pagination),
  };
}

// ── Receivables / Payables ─────────────────────────────────────────────────

export async function receivablesReport(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (shopId && membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  // Customers are business-level (no shop scope in this schema).
  void shopId;

  const match = { businessId: oid(businessId), currentDue: { $gt: 0 } };
  const [totalsAgg] = await Customer.aggregate<Record<string, number>>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$currentDue" }, count: { $sum: 1 } } },
  ]);

  const pagination = paginationOf(query);
  const [items, count] = await Promise.all([
    Customer.find(match, { name: 1, phone: 1, customerCode: 1, creditLimit: 1, currentDue: 1 })
      .sort({ currentDue: -1, name: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Customer.countDocuments(match),
  ]);

  return {
    totals: { total: totalsAgg?.total ?? 0, count: totalsAgg?.count ?? 0 },
    items: items.map((c) => ({
      id: String(c._id),
      name: c.name,
      phone: c.phone ?? null,
      customerCode: c.customerCode ?? null,
      creditLimit: c.creditLimit ?? 0,
      currentDue: c.currentDue ?? 0,
    })),
    pagination: buildPagination(count, pagination),
  };
}

export async function payablesReport(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (shopId && membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  void shopId;

  const match = { businessId: oid(businessId), currentPayable: { $gt: 0 } };
  const [totalsAgg] = await Supplier.aggregate<Record<string, number>>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$currentPayable" }, count: { $sum: 1 } } },
  ]);

  const pagination = paginationOf(query);
  const [items, count] = await Promise.all([
    Supplier.find(match, { name: 1, phone: 1, company: 1, currentPayable: 1 })
      .sort({ currentPayable: -1, name: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Supplier.countDocuments(match),
  ]);

  return {
    totals: { total: totalsAgg?.total ?? 0, count: totalsAgg?.count ?? 0 },
    items: items.map((s) => ({
      id: String(s._id),
      name: s.name,
      phone: s.phone ?? null,
      company: s.company ?? null,
      currentPayable: s.currentPayable ?? 0,
    })),
    pagination: buildPagination(count, pagination),
  };
}

// ── Expenses by category ───────────────────────────────────────────────────

export async function expensesReport(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery
) {
  const filter = await scopedFilter(userId, businessId, shopId, query, "expenseDate");

  const rows = await Expense.aggregate<{ category: string; count: number; total: number }>([
    { $match: filter },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
        total: { $sum: "$amount" },
      },
    },
    { $sort: { total: -1 } },
    { $project: { _id: 0, category: "$_id", count: 1, total: 1 } },
  ]);

  return {
    items: rows,
    totalCount: rows.reduce((s, r) => s + r.count, 0),
    totalAmount: rows.reduce((s, r) => s + r.total, 0),
  };
}

// ── Profit & Loss (delegates to the VERIFIED Phase 07 engine) ──────────────

export function profitLossReport(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: Pick<ReportQuery, "from" | "to">
) {
  // Same service that powers GET /api/v1/accounting/profit-loss - one source
  // of truth, no duplicated aggregation logic.
  return accountingService.profitLoss(userId, businessId, shopId, query);
}

