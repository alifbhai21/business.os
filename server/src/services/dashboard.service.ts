import { Types } from "mongoose";
import { Sale } from "../models/Sale";
import { Purchase } from "../models/Purchase";
import { Expense } from "../models/Expense";
import { Payment } from "../models/Payment";
import { Product } from "../models/Product";
import { Customer } from "../models/Customer";
import { Supplier } from "../models/Supplier";
import { Account } from "../models/Account";
import { membershipFor } from "./membership";
import * as accountingService from "./accounting.service";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 08 — Owner dashboard.
 *
 * Every figure here is SERVER-AUTHORITATIVE and derived from the verified
 * transactional documents (Phase 05/06) and the verified journal engine
 * (Phase 07). Nothing is recomputed on the client.
 *
 * Scope rules mirror accounting.service.resolveScope: tenant-scoped always,
 * shop-pinned memberships are pinned server-side; a shop-pinned member can
 * never widen their own scope.
 *
 * "Today" is the server's local calendar day (the process timezone). There is
 * deliberately no per-business timezone yet — documented limitation.
 */

const LOW_STOCK_LIMIT = 10;
const RECENT_PER_SOURCE = 5;
const RECENT_LIMIT = 10;

const oid = (id: string) => new Types.ObjectId(id);

interface RecentItem {
  type: "SALE" | "PURCHASE" | "EXPENSE" | "PAYMENT";
  id: string;
  date: Date;
  refNo: string | null;
  party: string | null;
  /** Integer paisa. Signed negative for money OUT (purchases/expenses/supplier payments). */
  amount: number;
}

export async function getDashboard(
  userId: string,
  businessId: string,
  shopId: string | null | undefined
) {
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

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const todayRange = { $gte: dayStart, $lte: dayEnd };

  // ── Today's transactions (COMPLETED sales/purchases never include VOIDED) ──
  const saleMatch: Record<string, unknown> = {
    businessId: oid(businessId),
    status: "COMPLETED",
    saleDate: todayRange,
  };
  const purchaseMatch: Record<string, unknown> = {
    businessId: oid(businessId),
    status: "COMPLETED",
    purchaseDate: todayRange,
  };
  const expenseMatch: Record<string, unknown> = {
    businessId: oid(businessId),
    expenseDate: todayRange,
  };
  if (effectiveShopId) {
    saleMatch.shopId = oid(effectiveShopId);
    purchaseMatch.shopId = oid(effectiveShopId);
    expenseMatch.shopId = oid(effectiveShopId);
  }

  const [salesAgg, purchasesAgg, expensesAgg] = await Promise.all([
    Sale.aggregate<Record<string, number>>([
      { $match: saleMatch },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: "$total" },
          paid: { $sum: "$paidAmount" },
          due: { $sum: "$dueAmount" },
        },
      },
    ]),
    Purchase.aggregate<Record<string, number>>([
      { $match: purchaseMatch },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } },
    ]),
    Expense.aggregate<Record<string, number>>([
      { $match: expenseMatch },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ]),
  ]);

  const sales = salesAgg[0] ?? { count: 0, total: 0, paid: 0, due: 0 };
  const purchases = purchasesAgg[0] ?? { count: 0, total: 0 };
  const expenses = expensesAgg[0] ?? { count: 0, total: 0 };

  // ── Profit: reused VERIFIED journal engine (Phase 07 P&L over today) ───────
  const pl = await accountingService.profitLoss(userId, businessId, effectiveShopId, {
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
  });

  // ── Stock valuation (products are business-level in this schema) ──────────
  const stockAgg = await Product.aggregate<{ count: number; units: number; value: number }>([
    { $match: { businessId: oid(businessId) } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        units: { $sum: "$currentStock" },
        value: { $sum: { $multiply: ["$currentStock", "$avgCost"] } },
      },
    },
  ]);
  const stock = stockAgg[0] ?? { count: 0, units: 0, value: 0 };

  // ── Cash (accounts are shop-scoped) ────────────────────────────────────────
  const accountFilter: Record<string, unknown> = { businessId: oid(businessId) };
  if (effectiveShopId) accountFilter.shopId = oid(effectiveShopId);
  const accounts = await Account.find(accountFilter).sort({ name: 1 }).lean();
  const cashTotal = accounts.reduce((s, a) => s + a.currentBalance, 0);

  // ── Receivables / Payables (customers/suppliers are business-level) ───────
  const [receivableAgg] = await Customer.aggregate<{ total: number; count: number }>([
    { $match: { businessId: oid(businessId), currentDue: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$currentDue" }, count: { $sum: 1 } } },
  ]);
  const [payableAgg] = await Supplier.aggregate<{ total: number; count: number }>([
    { $match: { businessId: oid(businessId), currentPayable: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$currentPayable" }, count: { $sum: 1 } } },
  ]);

  // ── Low stock (same predicate as inventory.service.listStock) ──────────────
  const lowStockExpr = {
    $expr: { $and: [{ $gt: ["$minStock", 0] }, { $lte: ["$currentStock", "$minStock"] }] },
  };
  const [lowStockCount, lowStockRows] = await Promise.all([
    Product.countDocuments({ businessId: oid(businessId), ...lowStockExpr }),
    Product.find(
      { businessId: oid(businessId), ...lowStockExpr },
      { name: 1, sku: 1, unit: 1, currentStock: 1, minStock: 1 }
    )
      .sort({ currentStock: 1 })
      .limit(LOW_STOCK_LIMIT)
      .lean(),
  ]);

  // ── Recent activity (top N per source, merged newest-first) ───────────────
  // Sales/purchases recents are COMPLETED only: a DRAFT carries no invoice and
  // no financial effect, a VOIDED one was reversed — neither is "activity".
  const recentFilter = {
    businessId: oid(businessId),
    ...(effectiveShopId ? { shopId: oid(effectiveShopId) } : {}),
  };
  const [recentSales, recentPurchases, recentExpenses, recentPayments] = await Promise.all([
    Sale.find({ ...recentFilter, status: "COMPLETED" }).sort({ createdAt: -1 }).limit(RECENT_PER_SOURCE).lean(),
    Purchase.find({ ...recentFilter, status: "COMPLETED" }).sort({ createdAt: -1 }).limit(RECENT_PER_SOURCE).lean(),
    Expense.find(recentFilter).sort({ createdAt: -1 }).limit(RECENT_PER_SOURCE).lean(),
    Payment.find(recentFilter).sort({ createdAt: -1 }).limit(RECENT_PER_SOURCE).lean(),
  ]);

  const recent: RecentItem[] = [
    ...recentSales.map((s) => ({
      type: "SALE" as const,
      id: String(s._id),
      date: s.createdAt,
      refNo: s.invoiceNo ?? null,
      party: s.customerName ?? null,
      amount: s.total,
    })),
    ...recentPurchases.map((p) => ({
      type: "PURCHASE" as const,
      id: String(p._id),
      date: p.createdAt,
      refNo: p.invoiceNo ?? null,
      party: p.supplierName ?? null,
      amount: -p.total,
    })),
    ...recentExpenses.map((e) => ({
      type: "EXPENSE" as const,
      id: String(e._id),
      date: e.createdAt,
      refNo: e.category,
      party: null,
      amount: -e.amount,
    })),
    ...recentPayments.map((p) => ({
      type: "PAYMENT" as const,
      id: String(p._id),
      date: p.createdAt,
      refNo: p.method,
      party: null,
      amount: p.type === "supplier_payment" ? -p.amount : p.amount,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, RECENT_LIMIT);

  return {
    generatedAt: now,
    scope: { businessId, shopId: effectiveShopId },
    today: {
      date: dayStart.toISOString(),
      salesCount: sales.count,
      salesTotal: sales.total,
      salesPaid: sales.paid,
      salesDue: sales.due,
      purchasesCount: purchases.count,
      purchasesTotal: purchases.total,
      expensesCount: expenses.count,
      expensesTotal: expenses.total,
      grossProfit: pl.grossProfit,
    },
    stockValue: stock.value,
    stockUnits: stock.units,
    productCount: stock.count,
    cash: {
      total: cashTotal,
      accounts: accounts.map((a) => ({
        id: String(a._id),
        name: a.name,
        type: a.type,
        currentBalance: a.currentBalance,
      })),
    },
    receivablesTotal: receivableAgg?.total ?? 0,
    receivablesCount: receivableAgg?.count ?? 0,
    payablesTotal: payableAgg?.total ?? 0,
    payablesCount: payableAgg?.count ?? 0,
    lowStockCount,
    lowStock: lowStockRows.map((p) => ({
      id: String(p._id),
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      currentStock: p.currentStock,
      minStock: p.minStock,
    })),
    recentTransactions: recent,
  };
}
