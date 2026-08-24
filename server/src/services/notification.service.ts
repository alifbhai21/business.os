import { Types } from "mongoose";
import { Product } from "../models/Product";
import { Customer } from "../models/Customer";
import { Supplier } from "../models/Supplier";
import { SyncEvent } from "../models/SyncEvent";
import {
  Notification,
  NotificationRead,
  NotificationPreference,
  NOTIFICATION_TYPES,
  PREFERENCE_KEYS,
  type NotificationType,
  type PreferenceKey,
} from "../models/Notification";
import { membershipFor } from "./membership";
import { ApiError } from "../utils/ApiError";
import { parsePagination, buildPagination } from "../utils/pagination";

/**
 * Phase 12 — in-app notification engine.
 *
 * Materialization is LAZY and IDEMPOTENT: reading the list first upserts
 * rows for every currently-true condition keyed by a deterministic dedupKey
 * ({businessId, dedupKey} unique). Retried/concurrent evaluations collapse
 * onto the same rows, so generation can never duplicate — and it never
 * writes inside the verified financial transactions.
 *
 * Read-state is per user (NotificationRead), preferences only SUPPRESS
 * types at read time and can never grant anything.
 */

function dayBucket(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

interface PendingRow {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId | null;
  type: NotificationType;
  title: string;
  body: string;
  dedupKey: string;
  refType: string | null;
  refId: string | null;
}

/** Scan current conditions and upsert one row per true condition per bucket. */
export async function evaluateAndMaterialize(
  userId: string,
  businessId: string
): Promise<{ materialized: number; scanned: { lowStock: number; customerDue: number; supplierDue: number; syncFailure: number } }> {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const bizOid = new Types.ObjectId(businessId);
  const today = dayBucket();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [lowStockProducts, dueCustomers, payableSuppliers, failedSyncs] = await Promise.all([
    Product.find({
      businessId: bizOid,
      minStock: { $gt: 0 },
      $expr: { $lte: ["$currentStock", "$minStock"] },
    })
      .select("name currentStock minStock")
      .limit(200)
      .lean(),
    Customer.find({ businessId: bizOid, creditLimit: { $gt: 0 }, status: "ACTIVE" })
      .select("name currentDue creditLimit")
      .limit(200)
      .lean(),
    Supplier.find({ businessId: bizOid, currentPayable: { $gt: 0 }, status: "ACTIVE" })
      .select("name currentPayable")
      .limit(200)
      .lean(),
    // Device identity of the failure rides on the event row; the reader
    // sees WHICH device failed but never any credential material.
    SyncEvent.find({ businessId: bizOid, direction: "PUSH", status: "FAILED", createdAt: { $gte: weekAgo } })
      .select("_id createdAt deviceId opCount conflictCount failedCount")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const rows: PendingRow[] = [];

  for (const p of lowStockProducts) {
    rows.push({
      businessId: bizOid,
      // Products are business-level (Phase 04) — stock alerts have no shop scope.
      shopId: null,
      type: "LOW_STOCK",
      title: "Low stock",
      body: `${p.name}: ${p.currentStock} left (minimum ${p.minStock})`,
      dedupKey: `LOW_STOCK:${String(p._id)}:${today}`,
      refType: "PRODUCT",
      refId: String(p._id),
    });
  }
  for (const c of dueCustomers) {
    if (c.currentDue < c.creditLimit) continue;
    rows.push({
      businessId: bizOid,
      shopId: null, // parties are business-level (Phase 04 decision)
      type: "CUSTOMER_DUE",
      title: "Customer over credit limit",
      body: `${c.name} is due ${c.currentDue} (limit ${c.creditLimit})`,
      dedupKey: `CUSTOMER_DUE:${String(c._id)}:${today}`,
      refType: "CUSTOMER",
      refId: String(c._id),
    });
  }
  for (const s of payableSuppliers) {
    rows.push({
      businessId: bizOid,
      shopId: null,
      type: "SUPPLIER_DUE",
      title: "Supplier payable outstanding",
      body: `${s.name}: payable ${s.currentPayable}`,
      dedupKey: `SUPPLIER_DUE:${String(s._id)}:${today}`,
      refType: "SUPPLIER",
      refId: String(s._id),
    });
  }
  for (const e of failedSyncs) {
    rows.push({
      businessId: bizOid,
      shopId: null,
      type: "SYNC_FAILURE",
      title: "Sync failure",
      body: `A device push batch failed on ${new Date(e.createdAt).toISOString().slice(0, 16)}Z`,
      dedupKey: `SYNC_FAILURE:${String(e._id)}`, // once per failed event
      refType: "SYNC_EVENT",
      refId: String(e._id),
    });
  }

  const scanned = {
    lowStock: lowStockProducts.length,
    customerDue: dueCustomers.filter((c) => c.currentDue >= c.creditLimit).length,
    supplierDue: payableSuppliers.length,
    syncFailure: failedSyncs.length,
  };

  if (rows.length === 0) return { materialized: 0, scanned };

  // Ordered:false lets parallel inserts of DIFFERENT keys succeed while a
  // duplicate key only skips its own row — idempotent under concurrency.
  const bulk = Notification.collection.initializeUnorderedBulkOp();
  for (const row of rows) {
    bulk
      .find({ businessId: row.businessId, dedupKey: row.dedupKey })
      .upsert()
      .updateOne({ $setOnInsert: { ...row } });
  }
  const result = await bulk.execute();
  const materialized = result.upsertedCount ?? 0;

  return { materialized, scanned };
}

export interface ListOptions {
  businessId: string;
  filter?: "all" | "unread";
  page?: unknown;
  limit?: unknown;
}

export async function listNotifications(userId: string, options: ListOptions) {
  const membership = await membershipFor(userId, options.businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  // Reader's suppressions (absent doc = everything on).
  const prefsDoc = await NotificationPreference.findOne({
    userId: new Types.ObjectId(userId),
    businessId: new Types.ObjectId(options.businessId),
  }).lean();
  const suppressed = new Set<NotificationType>(
    PREFERENCE_KEYS.filter((k) => prefsDoc && prefsDoc.toggles[k] === false).map((k) => TYPE_BY_KEY[k])
  );

  const visibility: Record<string, unknown> = {
    businessId: new Types.ObjectId(options.businessId),
  };
  if (membership.shopId) {
    // Shop-pinned members see their shop's rows plus business-wide alerts.
    visibility.$or = [{ shopId: membership.shopId }, { shopId: null }];
  }

  const pagination = parsePagination(options as unknown as Record<string, unknown>);
  const baseFilter: Record<string, unknown> = {
    ...visibility,
    ...(suppressed.size > 0 ? { type: { $nin: [...suppressed] } } : {}),
  };

  const rows = await Notification.find(baseFilter)
    .sort({ createdAt: -1 })
    .limit(pagination.limit + pagination.skip)
    .lean();

  const reads = await NotificationRead.find({
    userId: new Types.ObjectId(userId),
    notificationId: { $in: rows.map((r) => r._id) },
  })
    .select("notificationId")
    .lean();
  const readIds = new Set(reads.map((r) => String(r.notificationId)));

  let items = rows.map((r) => ({
    id: String(r._id),
    type: r.type,
    title: r.title,
    body: r.body,
    shopId: r.shopId ? String(r.shopId) : null,
    refType: r.refType,
    refId: r.refId,
    read: readIds.has(String(r._id)),
    createdAt: r.createdAt,
  }));
  if (options.filter === "unread") items = items.filter((i) => !i.read);

  const totalBeforePagination = items.length;
  items = items.slice(pagination.skip, pagination.skip + pagination.limit);

  return {
    data: items,
    unreadCount: items.filter((i) => !i.read).length,
    pagination: buildPagination(totalBeforePagination, pagination),
  };
}

const TYPE_BY_KEY: Record<PreferenceKey, NotificationType> = {
  lowStock: "LOW_STOCK",
  customerDue: "CUSTOMER_DUE",
  supplierDue: "SUPPLIER_DUE",
  syncFailure: "SYNC_FAILURE",
};

export async function markRead(userId: string, businessId: string, notificationId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (!Types.ObjectId.isValid(notificationId)) throw ApiError.notFound("Notification not found");

  const notification = await Notification.findOne({
    _id: new Types.ObjectId(notificationId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!notification) throw ApiError.notFound("Notification not found");

  // Idempotent acknowledgement.
  await NotificationRead.updateOne(
    {
      userId: new Types.ObjectId(userId),
      notificationId: notification._id,
    },
    { $setOnInsert: { userId: new Types.ObjectId(userId), notificationId: notification._id } },
    { upsert: true }
  );
  return { id: notificationId, read: true };
}

export async function markAllRead(userId: string, businessId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const visibility: Record<string, unknown> = {
    businessId: new Types.ObjectId(businessId),
  };
  if (membership.shopId) {
    visibility.$or = [{ shopId: membership.shopId }, { shopId: null }];
  }
  const visible = await Notification.find(visibility).select("_id").lean();
  if (visible.length === 0) return { marked: 0 };

  const existing = await NotificationRead.find({
    userId: new Types.ObjectId(userId),
    notificationId: { $in: visible.map((v) => v._id) },
  })
    .select("notificationId")
    .lean();
  const already = new Set(existing.map((e) => String(e.notificationId)));
  const toInsert = visible
    .filter((v) => !already.has(String(v._id)))
    .map((v) => ({ userId: new Types.ObjectId(userId), notificationId: v._id }));

  if (toInsert.length > 0) {
    await NotificationRead.insertMany(toInsert, { ordered: false });
  }
  return { marked: toInsert.length };
}

export async function getPreferences(userId: string, businessId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const doc = await NotificationPreference.findOne({
    userId: new Types.ObjectId(userId),
    businessId: new Types.ObjectId(businessId),
  }).lean();
  return {
    toggles: {
      lowStock: doc?.toggles.lowStock ?? true,
      customerDue: doc?.toggles.customerDue ?? true,
      supplierDue: doc?.toggles.supplierDue ?? true,
      syncFailure: doc?.toggles.syncFailure ?? true,
    },
  };
}

export async function updatePreferences(
  userId: string,
  businessId: string,
  input: Partial<Record<PreferenceKey, boolean>>
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const update: Record<string, boolean> = {};
  for (const key of PREFERENCE_KEYS) {
    if (input[key] !== undefined) update[`toggles.${key}`] = input[key];
  }

  const doc = await NotificationPreference.findOneAndUpdate(
    {
      userId: new Types.ObjectId(userId),
      businessId: new Types.ObjectId(businessId),
    },
    { $set: update, $setOnInsert: { userId: new Types.ObjectId(userId), businessId: new Types.ObjectId(businessId) } },
    { upsert: true, new: true }
  ).lean();

  return {
    toggles: {
      lowStock: doc!.toggles.lowStock,
      customerDue: doc!.toggles.customerDue,
      supplierDue: doc!.toggles.supplierDue,
      syncFailure: doc!.toggles.syncFailure,
    },
  };
}

export { NOTIFICATION_TYPES };
