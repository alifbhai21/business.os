import { Types } from "mongoose";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import { Business } from "../models/Business";
import { Shop } from "../models/Shop";
import { Category } from "../models/Category";
import { Account } from "../models/Account";
import { Product } from "../models/Product";
import { Customer } from "../models/Customer";
import { Supplier } from "../models/Supplier";
import { Sale } from "../models/Sale";
import { Purchase } from "../models/Purchase";
import { Payment } from "../models/Payment";
import { Expense } from "../models/Expense";
import { StockMovement } from "../models/StockMovement";
import { JournalEntry } from "../models/JournalEntry";
import { JournalLine } from "../models/JournalLine";
import { AuditLog } from "../models/AuditLog";
import { SyncEvent } from "../models/SyncEvent";
import { ApiError } from "../utils/ApiError";
import { membershipFor } from "./membership";
import { toCsv } from "../utils/csv";
import type { ExportCsvType } from "../validation/backup.schemas";

/**
 * Phase 11 — Backup & Restore (server half).
 *
 * STRATEGY: MongoDB Atlas is the system of record and therefore the cloud
 * backup source. Every business mutation is already durably persisted in
 * Atlas inside a transaction (Phases 05–10) with an AuditLog row; cluster
 * snapshots (M10+ continuous backup / scheduled snapshots) are the
 * disaster-recovery layer on top. What this module adds is the application
 * surface required by the PRD:
 *
 *  - backupStatus(): visibility that data IS persisted in Atlas (counts +
 *    last-write timestamps per collection) — feeds the mobile indicator.
 *  - restoreData(): full operational dataset for a NEW device. Read-only;
 *    writes exactly ONE SyncEvent(RESTORE) row for observability.
 *  - exportData()/exportCsv(): user-owned archive of the whole business,
 *    including journals and audit trail, gated by `data:export`.
 *
 * SECURITY INVARIANTS:
 *  - Tenant gate = ACTIVE BusinessMembership (never client ids alone).
 *  - Restore is available to every active member (a Salesperson with a new
 *    phone must be able to resume working); shop-pinned members receive
 *    their own shop's transactions only.
 *  - Exports require the `data:export` permission (Owner/Admin/Manager/
 *    Accountant) — checked at route AND service level.
 *  - Every export writes a DATA_EXPORTED AuditLog row (who exported what).
 *  - No endpoint here ever mutates business documents; the ONLY writes are
 *    observability rows (SyncEvent RESTORE, AuditLog DATA_EXPORTED).
 */

const EXPORT_ROLES = ["Owner", "Admin", "Manager", "Accountant"];
export const DEFAULT_RESTORE_LIMIT = 1000;

function oid(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

async function requireMembership(userId: string, businessId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  return membership;
}

async function requireExportPermission(userId: string, businessId: string) {
  const membership = await requireMembership(userId, businessId);
  const allowed =
    EXPORT_ROLES.includes(membership.role) ||
    (membership.permissions ?? []).includes("data:export");
  if (!allowed) throw ApiError.forbidden("Insufficient permission to export business data");
  return membership;
}

/** Drop Mongo internals; keep ids as strings so JSON stays stable. */
function publicDoc(doc: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc as { _id: unknown; __v: unknown };
  return { id: String(_id), ...(rest as Record<string, unknown>) };
}

// ────────────────────────────────────────────────────────────────────────────
// Backup status — "is my data safely in the cloud?"
// ────────────────────────────────────────────────────────────────────────────

export interface BackupStatus {
  businessId: string;
  database: string;
  connected: boolean;
  healthy: boolean;
  counts: {
    shops: number;
    categories: number;
    accounts: number;
    products: number;
    customers: number;
    suppliers: number;
    sales: number;
    purchases: number;
    payments: number;
    expenses: number;
    stockMovements: number;
    journalEntries: number;
    auditLogs: number;
  };
  lastWriteAt: string | null;
  lastAuditAt: string | null;
  lastSyncEventAt: string | null;
}

export async function backupStatus(userId: string, businessId: string): Promise<BackupStatus> {
  await requireMembership(userId, businessId);
  const filter = { businessId: oid(businessId) };

  const [
    shops,
    categories,
    accounts,
    products,
    customers,
    suppliers,
    sales,
    purchases,
    payments,
    expenses,
    stockMovements,
    journalEntries,
    auditLogs,
    lastProduct,
    lastAudit,
    lastSyncEvent,
  ] = await Promise.all([
    Shop.countDocuments(filter),
    Category.countDocuments(filter),
    Account.countDocuments(filter),
    Product.countDocuments(filter),
    Customer.countDocuments(filter),
    Supplier.countDocuments(filter),
    Sale.countDocuments(filter),
    Purchase.countDocuments(filter),
    Payment.countDocuments(filter),
    Expense.countDocuments(filter),
    StockMovement.countDocuments(filter),
    JournalEntry.countDocuments(filter),
    AuditLog.countDocuments(filter),
    // Newest write across high-traffic collections (max updatedAt).
    Promise.all([
      Sale.findOne(filter).sort({ updatedAt: -1 }).select("updatedAt").lean(),
      Purchase.findOne(filter).sort({ updatedAt: -1 }).select("updatedAt").lean(),
      Payment.findOne(filter).sort({ updatedAt: -1 }).select("updatedAt").lean(),
      Expense.findOne(filter).sort({ updatedAt: -1 }).select("updatedAt").lean(),
    ]),
    AuditLog.findOne(filter).sort({ createdAt: -1 }).select("createdAt").lean(),
    SyncEvent.findOne(filter).sort({ createdAt: -1 }).select("createdAt").lean(),
  ]);

  const newestWrite = lastProduct.reduce<Date | null>((acc, doc) => {
    const d = doc?.updatedAt ? new Date(doc.updatedAt) : null;
    if (!d) return acc;
    return !acc || d > acc ? d : acc;
  }, null);

  const counts = {
    shops,
    categories,
    accounts,
    products,
    customers,
    suppliers,
    sales,
    purchases,
    payments,
    expenses,
    stockMovements,
    journalEntries,
    auditLogs,
  };

  return {
    businessId,
    database: mongoose.connection.name,
    connected: mongoose.connection.readyState === 1,
    healthy:
      mongoose.connection.readyState === 1 &&
      Object.values(counts).some((c) => c > 0),
    counts,
    lastWriteAt: newestWrite ? newestWrite.toISOString() : null,
    lastAuditAt: lastAudit?.createdAt ? new Date(lastAudit.createdAt).toISOString() : null,
    lastSyncEventAt: lastSyncEvent?.createdAt
      ? new Date(lastSyncEvent.createdAt).toISOString()
      : null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Restore — full dataset pull for a new device
// ────────────────────────────────────────────────────────────────────────────

interface CollectionBundle {
  business: Record<string, unknown> | null;
  shops: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  accounts: Record<string, unknown>[];
  products: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  suppliers: Record<string, unknown>[];
  sales: Record<string, unknown>[];
  purchases: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  stockMovements: Record<string, unknown>[];
}

/**
 * Load the full operational dataset. Master data is business-wide;
 * transactions honour the caller's shop pin exactly like every other API
 * (`membership.shopId` narrows the scope server-side — never widened by
 * the request).
 */
async function loadBusinessDataset(
  userId: string,
  businessId: string,
  limit: number,
  options: { includeAccounting: boolean }
): Promise<{ membership: NonNullable<Awaited<ReturnType<typeof membershipFor>>>; data: CollectionBundle & { journalEntries?: Record<string, unknown>[]; journalLines?: Record<string, unknown>[]; auditLogs?: Record<string, unknown>[] } }> {
  const membership = await requireMembership(userId, businessId);
  const bizOid = oid(businessId);

  const businessDoc = await Business.findById(bizOid).lean();
  if (!businessDoc || businessDoc.status !== "ACTIVE") {
    throw ApiError.notFound("Business not found");
  }

  const txFilter: Record<string, unknown> = { businessId: bizOid };
  const accountFilter: Record<string, unknown> = { businessId: bizOid };
  if (membership.shopId) {
    txFilter.shopId = membership.shopId;
    accountFilter.shopId = membership.shopId;
  }

  const [
    shops,
    categories,
    accounts,
    products,
    customers,
    suppliers,
    sales,
    purchases,
    payments,
    expenses,
    stockMovements,
  ] = await Promise.all([
    Shop.find({ businessId: bizOid }).sort({ createdAt: 1 }).limit(limit).lean(),
    Category.find({ businessId: bizOid }).sort({ createdAt: 1 }).limit(limit).lean(),
    Account.find(accountFilter).sort({ createdAt: 1 }).limit(limit).lean(),
    Product.find({ businessId: bizOid }).sort({ createdAt: 1 }).limit(limit).lean(),
    Customer.find({ businessId: bizOid }).sort({ createdAt: 1 }).limit(limit).lean(),
    Supplier.find({ businessId: bizOid }).sort({ createdAt: 1 }).limit(limit).lean(),
    Sale.find(txFilter).sort({ createdAt: 1 }).limit(limit).lean(),
    Purchase.find(txFilter).sort({ createdAt: 1 }).limit(limit).lean(),
    Payment.find(txFilter).sort({ createdAt: 1 }).limit(limit).lean(),
    Expense.find(txFilter).sort({ createdAt: 1 }).limit(limit).lean(),
    StockMovement.find(txFilter).sort({ createdAt: 1 }).limit(limit).lean(),
  ]);

  const data: CollectionBundle & {
    journalEntries?: Record<string, unknown>[];
    journalLines?: Record<string, unknown>[];
    auditLogs?: Record<string, unknown>[];
  } = {
    business: publicDoc(businessDoc),
    shops: shops.map(publicDoc) as Record<string, unknown>[],
    categories: categories.map(publicDoc) as Record<string, unknown>[],
    accounts: accounts.map(publicDoc) as Record<string, unknown>[],
    products: products.map(publicDoc) as Record<string, unknown>[],
    customers: customers.map(publicDoc) as Record<string, unknown>[],
    suppliers: suppliers.map(publicDoc) as Record<string, unknown>[],
    sales: sales.map(publicDoc) as Record<string, unknown>[],
    purchases: purchases.map(publicDoc) as Record<string, unknown>[],
    payments: payments.map(publicDoc) as Record<string, unknown>[],
    expenses: expenses.map(publicDoc) as Record<string, unknown>[],
    stockMovements: stockMovements.map(publicDoc) as Record<string, unknown>[],
  };

  if (options.includeAccounting) {
    const [journalEntries, auditLogs] = await Promise.all([
      JournalEntry.find(txFilter).sort({ createdAt: 1 }).limit(limit).lean(),
      AuditLog.find(txFilter).sort({ createdAt: 1 }).limit(limit).lean(),
    ]);
    // JournalLine carries no businessId — lines are resolved through their
    // parent entries so the export stays tenant-safe by construction.
    const entryIds = journalEntries.map((e) => e._id);
    const journalLines = entryIds.length
      ? await JournalLine.find({ entryId: { $in: entryIds } })
          .sort({ createdAt: 1 })
          .limit(limit * 4)
          .lean()
      : [];
    data.journalEntries = journalEntries.map(publicDoc) as Record<string, unknown>[];
    data.journalLines = journalLines.map(publicDoc) as Record<string, unknown>[];
    data.auditLogs = auditLogs.map(publicDoc) as Record<string, unknown>[];
  }

  return { membership, data };
}

export interface RestoreResult {
  restoredAt: string;
  counts: Record<string, number>;
  data: CollectionBundle;
}

export async function restoreData(
  userId: string,
  deviceId: string | null,
  input: { businessId: string; limit?: number }
): Promise<RestoreResult> {
  const limit = input.limit ?? DEFAULT_RESTORE_LIMIT;
  const { data } = await loadBusinessDataset(userId, input.businessId, limit, {
    includeAccounting: false,
  });

  const counts = {
    shops: data.shops.length,
    categories: data.categories.length,
    accounts: data.accounts.length,
    products: data.products.length,
    customers: data.customers.length,
    suppliers: data.suppliers.length,
    sales: data.sales.length,
    purchases: data.purchases.length,
    payments: data.payments.length,
    expenses: data.expenses.length,
    stockMovements: data.stockMovements.length,
  };

  // One observability row per restore call — device identity comes from the
  // VERIFIED JWT claims (05.13), never from the request.
  await SyncEvent.create({
    businessId: oid(input.businessId),
    userId: oid(userId),
    deviceId: deviceId ? oid(deviceId) : null,
    direction: "RESTORE",
    opCount: Object.values(counts).reduce((a, b) => a + b, 0),
    okCount: Object.values(counts).reduce((a, b) => a + b, 0),
    failedCount: 0,
    conflictCount: 0,
    status: "SUCCESS",
  });

  return { restoredAt: new Date().toISOString(), counts, data };
}

// ────────────────────────────────────────────────────────────────────────────
// Export — full JSON archive + per-entity CSV
// ────────────────────────────────────────────────────────────────────────────

export interface ExportResult {
  exportedAt: string;
  format: "json";
  counts: Record<string, number>;
  data: CollectionBundle & {
    journalEntries: Record<string, unknown>[];
    journalLines: Record<string, unknown>[];
    auditLogs: Record<string, unknown>[];
  };
}

export async function exportData(
  userId: string,
  input: { businessId: string; limit?: number }
): Promise<ExportResult> {
  const limit = input.limit ?? DEFAULT_RESTORE_LIMIT;
  // Defense in depth: re-check `data:export` even though the route
  // middleware already enforced it.
  await requireExportPermission(userId, input.businessId);
  const { data } = await loadBusinessDataset(userId, input.businessId, limit, {
    includeAccounting: true,
  });

  const full = data as ExportResult["data"];
  const counts = {
    shops: full.shops.length,
    categories: full.categories.length,
    accounts: full.accounts.length,
    products: full.products.length,
    customers: full.customers.length,
    suppliers: full.suppliers.length,
    sales: full.sales.length,
    purchases: full.purchases.length,
    payments: full.payments.length,
    expenses: full.expenses.length,
    stockMovements: full.stockMovements.length,
    journalEntries: full.journalEntries.length,
    journalLines: full.journalLines.length,
    auditLogs: full.auditLogs.length,
  };

  await AuditLog.create({
    userId: oid(userId),
    businessId: oid(input.businessId),
    action: "DATA_EXPORTED",
    details: "format=json",
  });

  return { exportedAt: new Date().toISOString(), format: "json", counts, data: full };
}

type Row = Record<string, unknown>;

const CSV_BUILDERS: Record<
  ExportCsvType,
  { headers: readonly string[]; shopScoped: boolean; rows: (rows: Row[]) => Array<Array<unknown>> }
> = {
  products: {
    headers: ["id", "name", "sku", "barcode", "unit", "purchasePrice", "sellingPrice", "wholesalePrice", "currentStock", "minStock", "avgCost", "taxRate", "status", "createdAt"],
    shopScoped: false,
    rows: (rows) =>
      rows.map((p) => [p.id, p.name, p.sku, p.barcode, p.unit, p.purchasePrice, p.sellingPrice, p.wholesalePrice, p.currentStock, p.minStock, p.avgCost, p.taxRate, p.status, p.createdAt]),
  },
  customers: {
    headers: ["id", "name", "phone", "email", "address", "customerCode", "creditLimit", "currentDue", "status", "createdAt"],
    shopScoped: false,
    rows: (rows) =>
      rows.map((c) => [c.id, c.name, c.phone, c.email, c.address, c.customerCode, c.creditLimit, c.currentDue, c.status, c.createdAt]),
  },
  suppliers: {
    headers: ["id", "name", "phone", "company", "address", "currentPayable", "status", "createdAt"],
    shopScoped: false,
    rows: (rows) =>
      rows.map((s) => [s.id, s.name, s.phone, s.company, s.address, s.currentPayable, s.status, s.createdAt]),
  },
  accounts: {
    headers: ["id", "name", "type", "shopId", "accountNumber", "currentBalance", "createdAt"],
    shopScoped: true,
    rows: (rows) =>
      rows.map((a) => [a.id, a.name, a.type, a.shopId, a.accountNumber, a.currentBalance, a.createdAt]),
  },
  sales: {
    headers: ["id", "invoiceNo", "date", "shopId", "customerId", "customerName", "subtotal", "discountAmount", "taxAmount", "total", "paidAmount", "dueAmount", "paymentStatus", "status"],
    shopScoped: true,
    rows: (rows) =>
      rows.map((s) => [s.id, s.invoiceNo, s.saleDate, s.shopId, s.customerId, s.customerName, s.subtotal, s.discountAmount, s.taxAmount, s.total, s.paidAmount, s.dueAmount, s.paymentStatus, s.status]),
  },
  purchases: {
    headers: ["id", "invoiceNo", "date", "shopId", "supplierId", "supplierName", "subtotal", "discountAmount", "taxAmount", "total", "paidAmount", "dueAmount", "paymentStatus", "status"],
    shopScoped: true,
    rows: (rows) =>
      rows.map((p) => [p.id, p.invoiceNo, p.purchaseDate, p.shopId, p.supplierId, p.supplierName, p.subtotal, p.discountAmount, p.taxAmount, p.total, p.paidAmount, p.dueAmount, p.paymentStatus, p.status]),
  },
  payments: {
    headers: ["id", "date", "type", "amount", "method", "shopId", "customerId", "supplierId", "accountId", "note"],
    shopScoped: true,
    rows: (rows) =>
      rows.map((p) => [p.id, p.paymentDate, p.type, p.amount, p.method, p.shopId, p.customerId, p.supplierId, p.accountId, p.note]),
  },
  expenses: {
    headers: ["id", "date", "category", "amount", "shopId", "paymentAccountId", "note"],
    shopScoped: true,
    rows: (rows) =>
      rows.map((e) => [e.id, e.expenseDate, e.category, e.amount, e.shopId, e.paymentAccountId, e.note]),
  },
};

/** Map an ExportCsvType to the dataset key produced by loadBusinessDataset. */
const DATASET_KEY: Record<ExportCsvType, keyof CollectionBundle | "accounts"> = {
  products: "products",
  customers: "customers",
  suppliers: "suppliers",
  accounts: "accounts",
  sales: "sales",
  purchases: "purchases",
  payments: "payments",
  expenses: "expenses",
};

/**
 * Phase 12 — shared tabular projection used by BOTH the CSV and Excel
 * exporters so the two formats can never disagree on scope or shape.
 */
async function buildExportRows(
  userId: string,
  input: { businessId: string; type: ExportCsvType; limit?: number }
): Promise<{ headers: readonly string[]; rows: Array<Array<unknown>> }> {
  const builder = CSV_BUILDERS[input.type];
  // RBAC first — a forbidden caller never triggers any data load.
  await requireExportPermission(userId, input.businessId);
  // Reuse the same loader so scoping rules stay identical across formats.
  const { data } = await loadBusinessDataset(userId, input.businessId, input.limit ?? DEFAULT_RESTORE_LIMIT, {
    includeAccounting: false,
  });
  const key = DATASET_KEY[input.type];
  const allRows = (data[key] ?? []) as Row[];
  return { headers: builder.headers, rows: builder.rows(allRows) };
}

export async function exportCsv(
  userId: string,
  input: { businessId: string; type: ExportCsvType; limit?: number }
): Promise<{ csv: string; rowCount: number }> {
  const { headers, rows } = await buildExportRows(userId, input);

  await AuditLog.create({
    userId: oid(userId),
    businessId: oid(input.businessId),
    action: "DATA_EXPORTED",
    details: `format=csv,type=${input.type}`,
  });

  return {
    csv: toCsv(headers, rows),
    rowCount: rows.length,
  };
}

export async function exportExcel(
  userId: string,
  input: { businessId: string; type: ExportCsvType; limit?: number }
): Promise<{ workbook: Awaited<ReturnType<ExcelJS.Workbook["xlsx"]["writeBuffer"]>>; rowCount: number }> {
  const { headers, rows } = await buildExportRows(userId, input);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Business OS";
  const sheet = wb.addWorksheet(input.type.slice(0, 30));
  sheet.addRow([...headers]);
  for (const row of rows) sheet.addRow(row);
  sheet.columns.forEach((col) => {
    let max = 10;
    for (const cell of col.values ?? []) {
      const len = String(cell ?? "").length;
      if (len > max) max = len;
    }
    col.width = Math.min(max + 2, 40);
  });

  const workbook = await wb.xlsx.writeBuffer();

  await AuditLog.create({
    userId: oid(userId),
    businessId: oid(input.businessId),
    action: "DATA_EXPORTED",
    details: `format=excel,type=${input.type}`,
  });

  return { workbook, rowCount: rows.length };
}
