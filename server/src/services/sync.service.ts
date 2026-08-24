import { Types } from "mongoose";
import { SyncEvent } from "../models/SyncEvent";
import { Product } from "../models/Product";
import { Customer } from "../models/Customer";
import { Supplier } from "../models/Supplier";
import { ApiError } from "../utils/ApiError";
import { membershipFor } from "./membership";
import * as saleService from "./sale.service";
import * as purchaseService from "./purchase.service";
import * as paymentService from "./payment.service";
import * as expenseService from "./expense.service";
import * as customerService from "./customer.service";
import * as supplierService from "./supplier.service";
import * as productService from "./product.service";
import {
  customerCreateSchema,
} from "../validation/customer.schemas";
import { supplierCreateSchema } from "../validation/supplier.schemas";
import { productCreateSchema } from "../validation/product.schemas";
import { saleCreateSchema } from "../validation/sale.schemas";
import { purchaseCreateSchema } from "../validation/purchase.schemas";
import { expenseCreateSchema } from "../validation/expense.schemas";
import { paymentCreateSchema } from "../validation/payment.schemas";
import {
  adjustStockSchema,
  openingStockSchema,
} from "../validation/inventory.schemas";
import * as inventoryService from "./inventory.service";
import type { SyncOpType } from "../validation/sync.schemas";

/**
 * Phase 10 — offline sync engine (server half).
 *
 * PUSH is a thin, ordered dispatcher over the VERIFIED Phase 05/06 engines.
 * It adds no financial logic of its own: every operation is validated by the
 * exact Zod schema of its online endpoint and executed by the same service,
 * so offline mutations get identical tenant/shop scoping, RBAC, guarded
 * stock/balance updates, journals, audit rows and exactly-once localId
 * idempotency. A retried queued op resolves to the ORIGINAL record
 * (`duplicate: true`) with zero additional effect.
 *
 * Per-op outcome mapping (PRD §9.2 statuses):
 * - SYNCED  — committed (or already present via duplicate recovery)
 * - CONFLICT — permanent rejection (validation 400 / forbidden 403 /
 *   not-found 404 / business rules like insufficient stock or balance).
 *   Retrying cannot succeed; the client surfaces it for resolution.
 * - FAILED  — unexpected internal error; safe to retry (the engine's
 *   exactly-once guarantees make retries harmless).
 *
 * Operations run strictly SEQUENTIALLY in queue order, preserving causal
 * ordering (e.g. expense before sale sharing one account balance guard).
 */

export interface PushOp {
  localId: string;
  type: SyncOpType;
  shopId?: string;
  payload: Record<string, unknown>;
}

export interface PushResult {
  localId: string;
  type: SyncOpType;
  status: "SYNCED" | "CONFLICT" | "FAILED";
  serverId?: string | null;
  duplicate?: boolean;
  error?: string | null;
}

interface ActorContext {
  userId: string;
  /** Verified device identity from JWT claims (05.13) — never from the body. */
  deviceId: string | null;
}

function firstZodMessage(error: { issues: { message: string; path: (string | number)[] }[] }): string {
  const first = error.issues[0];
  return first ? `${first.message}${first.path.length ? ` (${first.path.join(".")})` : ""}` : "Validation failed";
}

/**
 * The dispatched payloads are already deep-validated by the exact online
 * endpoint schemas above; the boundary casts below only bridge Zod's widened
 * output typing (e.g. defaulted enums) to the service input interfaces —
 * the same untyped handoff the online controllers perform with req.body.
 */

async function dispatchOp(
  actor: ActorContext,
  businessId: string,
  batchShopId: string | undefined,
  op: PushOp
): Promise<PushResult> {
  const shopId = op.shopId ?? batchShopId;

  switch (op.type) {
    case "sale": {
      const parsed = saleCreateSchema.safeParse({
        ...op.payload,
        businessId,
        ...(shopId ? { shopId } : {}),
      });
      if (!parsed.success) throw ApiError.badRequest(firstZodMessage(parsed.error));
      const { sale, duplicate } = await saleService.createSale(actor.userId, {
        ...(parsed.data as Parameters<typeof saleService.createSale>[1]),
        // The queue's idempotency anchor — retried pushes resolve to the
        // ORIGINAL sale instead of creating a second one.
        localId: op.localId,
        deviceId: actor.deviceId,
      });
      return { localId: op.localId, type: op.type, status: "SYNCED", serverId: sale.id, duplicate };
    }
    case "purchase": {
      const parsed = purchaseCreateSchema.safeParse({
        ...op.payload,
        businessId,
        ...(shopId ? { shopId } : {}),
      });
      if (!parsed.success) throw ApiError.badRequest(firstZodMessage(parsed.error));
      const { purchase, duplicate } = await purchaseService.createPurchase(actor.userId, {
        ...(parsed.data as Parameters<typeof purchaseService.createPurchase>[1]),
        localId: op.localId,
        deviceId: actor.deviceId,
      });
      return { localId: op.localId, type: op.type, status: "SYNCED", serverId: purchase.id, duplicate };
    }
    case "payment": {
      const parsed = paymentCreateSchema.safeParse({
        ...op.payload,
        businessId,
        // The queue's localId doubles as the payment idempotency key.
        idempotencyKey: (op.payload.idempotencyKey as string | undefined) ?? op.localId,
        ...(shopId ? { shopId } : {}),
      });
      if (!parsed.success) throw ApiError.badRequest(firstZodMessage(parsed.error));
      const { payment, duplicate } = await paymentService.recordPayment(actor.userId, {
        ...(parsed.data as Parameters<typeof paymentService.recordPayment>[1]),
        localId: op.localId,
        deviceId: actor.deviceId,
      });
      return { localId: op.localId, type: op.type, status: "SYNCED", serverId: payment.id, duplicate };
    }
    case "expense": {
      const parsed = expenseCreateSchema.safeParse({
        ...op.payload,
        businessId,
        ...(shopId ? { shopId } : {}),
      });
      if (!parsed.success) throw ApiError.badRequest(firstZodMessage(parsed.error));
      const { expense, duplicate } = await expenseService.createExpense(actor.userId, {
        ...(parsed.data as Parameters<typeof expenseService.createExpense>[1]),
        localId: op.localId,
        deviceId: actor.deviceId,
      });
      return { localId: op.localId, type: op.type, status: "SYNCED", serverId: expense.id, duplicate };
    }
    case "customer": {
      const parsed = customerCreateSchema.safeParse({ ...op.payload, businessId });
      if (!parsed.success) throw ApiError.badRequest(firstZodMessage(parsed.error));
      const data = await customerService.createCustomer(actor.userId, {
        ...(parsed.data as Parameters<typeof customerService.createCustomer>[1]),
        localId: op.localId,
      });
      return { localId: op.localId, type: op.type, status: "SYNCED", serverId: data.id, duplicate: data.duplicate };
    }
    case "supplier": {
      const parsed = supplierCreateSchema.safeParse({ ...op.payload, businessId });
      if (!parsed.success) throw ApiError.badRequest(firstZodMessage(parsed.error));
      const data = await supplierService.createSupplier(actor.userId, {
        ...(parsed.data as Parameters<typeof supplierService.createSupplier>[1]),
        localId: op.localId,
      });
      return { localId: op.localId, type: op.type, status: "SYNCED", serverId: data.id, duplicate: data.duplicate };
    }
    case "product": {
      const parsed = productCreateSchema.safeParse({ ...op.payload, businessId });
      if (!parsed.success) throw ApiError.badRequest(firstZodMessage(parsed.error));
      const data = await productService.createProduct(actor.userId, {
        ...(parsed.data as Parameters<typeof productService.createProduct>[1]),
        localId: op.localId,
      });
      return { localId: op.localId, type: op.type, status: "SYNCED", serverId: data.id, duplicate: data.duplicate };
    }
    // Phase 12 — offline inventory movements. Exactly-once is anchored on the
    // StockMovement localId (unique partial index + duplicate recovery), so
    // ONE queued op = ONE stock mutation; retries/concurrency add nothing.
    case "inventory_adjust": {
      const parsed = adjustStockSchema.safeParse({
        ...op.payload,
        businessId,
        ...(shopId ? { shopId } : {}),
      });
      if (!parsed.success) throw ApiError.badRequest(firstZodMessage(parsed.error));
      const result = await inventoryService.adjustStock(actor.userId, {
        ...(parsed.data as Parameters<typeof inventoryService.adjustStock>[1]),
        localId: op.localId,
      });
      return {
        localId: op.localId,
        type: op.type,
        status: "SYNCED",
        serverId: result.id,
        duplicate: result.duplicate,
      };
    }
    case "inventory_opening": {
      const parsed = openingStockSchema.safeParse({
        ...op.payload,
        businessId,
        ...(shopId ? { shopId } : {}),
      });
      if (!parsed.success) throw ApiError.badRequest(firstZodMessage(parsed.error));
      const result = await inventoryService.setOpeningStock(actor.userId, {
        ...(parsed.data as Parameters<typeof inventoryService.setOpeningStock>[1]),
        localId: op.localId,
      });
      return {
        localId: op.localId,
        type: op.type,
        status: "SYNCED",
        serverId: result.productId,
        duplicate: result.duplicate,
      };
    }
    default: {
      // Exhaustiveness guard — the route enum keeps this unreachable.
      throw ApiError.badRequest(`Unsupported sync operation type`);
    }
  }
}

export interface PushSummary {
  results: PushResult[];
  okCount: number;
  conflictCount: number;
  failedCount: number;
}

export async function pushOps(
  userId: string,
  deviceId: string | null,
  input: { businessId: string; shopId?: string; ops: PushOp[] }
): Promise<PushSummary> {
  const membership = await membershipFor(userId, input.businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const actor: ActorContext = { userId, deviceId };
  const results: PushResult[] = [];

  // Strictly sequential — preserves queue order for dependent balances.
  for (const op of input.ops) {
    try {
      results.push(await dispatchOp(actor, input.businessId, input.shopId, op));
    } catch (err) {
      if (err instanceof ApiError) {
        results.push({
          localId: op.localId,
          type: op.type,
          status: "CONFLICT",
          error: err.message,
        });
      } else {
        results.push({
          localId: op.localId,
          type: op.type,
          status: "FAILED",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  const okCount = results.filter((r) => r.status === "SYNCED").length;
  const conflictCount = results.filter((r) => r.status === "CONFLICT").length;
  const failedCount = results.filter((r) => r.status === "FAILED").length;

  await SyncEvent.create({
    businessId: new Types.ObjectId(input.businessId),
    userId: new Types.ObjectId(userId),
    deviceId: deviceId ? new Types.ObjectId(deviceId) : null,
    direction: "PUSH",
    opCount: input.ops.length,
    okCount,
    failedCount,
    conflictCount,
    status: failedCount > 0 ? "FAILED" : conflictCount > 0 ? "PARTIAL" : "SUCCESS",
  });

  return { results, okCount, conflictCount, failedCount };
}

type PullProduct = ReturnType<typeof productToPull>;
type PullCustomer = ReturnType<typeof customerToPull>;
type PullSupplier = ReturnType<typeof supplierToPull>;

export interface PullDelta {
  cursor: string;
  counts: { products: number; customers: number; suppliers: number };
  products: PullProduct[];
  customers: PullCustomer[];
  suppliers: PullSupplier[];
}

function productToPull(p: {
  _id: unknown;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  taxRate: number;
  currentStock: number;
  minStock: number;
  avgCost: number;
  status: string;
  updatedAt: Date;
}) {
  return {
    id: String(p._id),
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    unit: p.unit,
    purchasePrice: p.purchasePrice,
    sellingPrice: p.sellingPrice,
    taxRate: p.taxRate,
    currentStock: p.currentStock,
    minStock: p.minStock,
    avgCost: p.avgCost,
    status: p.status,
    updatedAt: p.updatedAt,
  };
}

function customerToPull(c: {
  _id: unknown;
  name: string;
  phone: string | null;
  address: string | null;
  customerCode: string | null;
  creditLimit: number;
  currentDue: number;
  status: string;
  updatedAt: Date;
}) {
  return {
    id: String(c._id),
    name: c.name,
    phone: c.phone,
    address: c.address,
    customerCode: c.customerCode,
    creditLimit: c.creditLimit,
    currentDue: c.currentDue,
    status: c.status,
    updatedAt: c.updatedAt,
  };
}

function supplierToPull(s: {
  _id: unknown;
  name: string;
  phone: string | null;
  company: string | null;
  address: string | null;
  currentPayable: number;
  status: string;
  updatedAt: Date;
}) {
  return {
    id: String(s._id),
    name: s.name,
    phone: s.phone,
    company: s.company,
    address: s.address,
    currentPayable: s.currentPayable,
    status: s.status,
    updatedAt: s.updatedAt,
  };
}

/**
 * Delta pull for master data (products/customers/suppliers) — everything
 * updated after the caller's cursor, oldest first, bounded per collection.
 */
export async function pullDelta(
  userId: string,
  input: { businessId: string; cursor?: string; limit?: number }
): Promise<PullDelta> {
  const membership = await membershipFor(userId, input.businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  let since = new Date(0);
  if (input.cursor) {
    const parsed = new Date(input.cursor);
    if (Number.isNaN(parsed.getTime())) throw ApiError.badRequest("Invalid cursor");
    since = parsed;
  }
  const limit = input.limit ?? 200;
  const businessFilter = { businessId: new Types.ObjectId(input.businessId) };
  const deltaFilter = { ...businessFilter, updatedAt: { $gt: since } };

  const [products, customers, suppliers] = await Promise.all([
    Product.find(deltaFilter).sort({ updatedAt: 1 }).limit(limit),
    Customer.find(deltaFilter).sort({ updatedAt: 1 }).limit(limit),
    Supplier.find(deltaFilter).sort({ updatedAt: 1 }).limit(limit),
  ]);

  const cursor = new Date();
  await SyncEvent.create({
    businessId: businessFilter.businessId,
    userId: new Types.ObjectId(userId),
    deviceId: null,
    direction: "PULL",
    opCount: products.length + customers.length + suppliers.length,
    okCount: products.length + customers.length + suppliers.length,
    failedCount: 0,
    conflictCount: 0,
    status: "SUCCESS",
  });

  return {
    cursor: cursor.toISOString(),
    counts: {
      products: products.length,
      customers: customers.length,
      suppliers: suppliers.length,
    },
    products: products.map(productToPull),
    customers: customers.map(customerToPull),
    suppliers: suppliers.map(supplierToPull),
  };
}

/**
 * Phase 14 — sync success-rate KPI (PRD monitoring requirement).
 *
 * Aggregates the Phase 10 SyncEvent ledger into a windowed KPI: per
 * direction (PUSH/PULL/RESTORE) event counts by status plus the op-level
 * success ratio for mutations (ok / (ok + conflict + failed)). The window
 * is bounded and the aggregation runs on the indexed {businessId,
 * createdAt:-1} path, so it never scans beyond one business's events.
 *
 * Business-scoped: membership is re-checked here (defense in depth) — an
 * outsider gets a plain 404 with no existence leakage.
 */
export async function syncStats(
  userId: string,
  businessId: string,
  since?: string | undefined
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const parsedSince = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(parsedSince.getTime())) {
    throw ApiError.badRequest("since must be a valid ISO 8601 date-time");
  }

  const rows = await SyncEvent.aggregate<{
    _id: "PUSH" | "PULL" | "RESTORE";
    events: number;
    success: number;
    partial: number;
    failed: number;
    opCount: number;
    okCount: number;
    failedCount: number;
    conflictCount: number;
  }>([
    {
      $match: {
        businessId: new Types.ObjectId(businessId),
        createdAt: { $gte: parsedSince },
      },
    },
    {
      $group: {
        _id: "$direction",
        events: { $sum: 1 },
        success: { $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] } },
        partial: { $sum: { $cond: [{ $eq: ["$status", "PARTIAL"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } },
        opCount: { $sum: "$opCount" },
        okCount: { $sum: "$okCount" },
        failedCount: { $sum: "$failedCount" },
        conflictCount: { $sum: "$conflictCount" },
      },
    },
  ]);

  const directions = (["PUSH", "PULL", "RESTORE"] as const).map((direction) => {
    const row = rows.find((r) => r._id === direction);
    const attempted = row ? row.okCount + row.failedCount + row.conflictCount : 0;
    return {
      direction,
      events: row?.events ?? 0,
      success: row?.success ?? 0,
      partial: row?.partial ?? 0,
      failed: row?.failed ?? 0,
      ops: {
        attempted,
        ok: row?.okCount ?? 0,
        conflicts: row?.conflictCount ?? 0,
        failed: row?.failedCount ?? 0,
        // Op-level exactly-once success ratio over MUTATION outcomes.
        successRate:
          attempted > 0 ? Math.round((row!.okCount / attempted) * 10000) / 100 : null,
      },
    };
  });

  const recentFailures = await SyncEvent.find({
    businessId: new Types.ObjectId(businessId),
    status: { $in: ["FAILED", "PARTIAL"] },
    createdAt: { $gte: parsedSince },
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("direction status error createdAt")
    .lean();

  const totals = rows.reduce(
    (acc, r) => ({
      events: acc.events + r.events,
      okOps: acc.okOps + r.okCount,
      badOps: acc.badOps + r.failedCount + r.conflictCount,
    }),
    { events: 0, okOps: 0, badOps: 0 }
  );

  return {
    since: parsedSince.toISOString(),
    overallSuccessRate:
      totals.okOps + totals.badOps > 0
        ? Math.round((totals.okOps / (totals.okOps + totals.badOps)) * 10000) / 100
        : null,
    totals,
    directions,
    recentFailures: recentFailures.map((f) => ({
      at: f.createdAt,
      direction: f.direction,
      status: f.status,
      error: f.error ?? null,
    })),
  };
}
