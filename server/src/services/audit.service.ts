import { Types } from "mongoose";
import { AuditLog, AuditLogDocument } from "../models/AuditLog";
import { User } from "../models/User";
import { membershipFor } from "./membership";
import { ApiError } from "../utils/ApiError";
import { parsePagination, buildPagination } from "../utils/pagination";

/**
 * Phase 09 — Audit trail read API.
 *
 * The audit WRITES already exist across the Phase 05–08 services (sales,
 * purchases, payments, expenses, voids, returns, transfers, auth events);
 * this is the missing business-scoped READ layer.
 *
 * RBAC: Owner/Admin/Manager/Accountant may read the audit trail — the same
 * persona matrix as financial reports. Salesperson / Inventory Manager /
 * Viewer are 403. Shop-pinned members are locked to their own shop's rows.
 */

const VIEW_ROLES = ["Owner", "Admin", "Manager", "Accountant"];

function toPublic(entry: AuditLogDocument) {
  return {
    id: String(entry._id),
    userId: entry.userId ? String(entry.userId) : null,
    businessId: entry.businessId ? String(entry.businessId) : null,
    shopId: entry.shopId ? String(entry.shopId) : null,
    action: entry.action,
    ip: entry.ip,
    details: entry.details,
    recordId: entry.recordId,
    createdAt: entry.createdAt,
  };
}

export interface ListAuditQuery {
  businessId: string;
  shopId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function listAudit(actorUserId: string, query: ListAuditQuery) {
  const membership = await membershipFor(actorUserId, query.businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (!VIEW_ROLES.includes(membership.role)) {
    throw ApiError.forbidden("Insufficient role to view audit logs");
  }

  const pagination = parsePagination(query as unknown as Record<string, unknown>);
  const filter: Record<string, unknown> = {
    businessId: new Types.ObjectId(query.businessId),
  };

  // Shop-pinned members only see their own shop's audit rows.
  let effectiveShopId = query.shopId ?? null;
  if (membership.shopId) {
    if (effectiveShopId && effectiveShopId !== String(membership.shopId)) {
      throw ApiError.notFound("Shop not found");
    }
    effectiveShopId = String(membership.shopId);
  }
  if (effectiveShopId) filter.shopId = new Types.ObjectId(effectiveShopId);

  if (query.action) filter.action = query.action;

  const dateRange: Record<string, Date> = {};
  if (query.from) dateRange.$gte = new Date(query.from);
  if (query.to) dateRange.$lte = new Date(query.to);
  if (Object.keys(dateRange).length > 0) filter.createdAt = dateRange;

  const [total, entries] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  // Resolve actor names in one query (presentation-only join).
  const userIds = [...new Set(entries.map((e) => e.userId).filter((v): v is Types.ObjectId => Boolean(v)))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select("_id name phone")
    : [];
  const userMap = new Map(users.map((u) => [String(u._id), { name: u.name, phone: u.phone }]));

  return {
    data: entries.map((entry) => ({
      ...toPublic(entry),
      userName: entry.userId ? userMap.get(String(entry.userId))?.name ?? null : null,
      userPhone: entry.userId ? userMap.get(String(entry.userId))?.phone ?? null : null,
    })),
    pagination: buildPagination(total, pagination),
  };
}