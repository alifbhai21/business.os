import { Types } from "mongoose";
import { Device, DeviceDocument } from "../models/Device";
import { RefreshToken } from "../models/RefreshToken";
import { User } from "../models/User";
import { Shop } from "../models/Shop";
import { AuditLog } from "../models/AuditLog";
import { membershipFor } from "./membership";
import { ApiError } from "../utils/ApiError";
import { parsePagination, buildPagination } from "../utils/pagination";

/**
 * Phase 09 — Device management.
 *
 * - Any authenticated member may REGISTER their own device (userId comes
 *   from the verified token, never the body).
 * - Owner/Admin/Manager may LIST and REVOKE business devices; revocation
 *   also terminates every outstanding refresh token issued to that device,
 *   so a revoked device loses access on its next token refresh.
 * - A device's sync heartbeat may only be updated by its own owner.
 * - Revocation is idempotent (re-revoke reports duplicate:true).
 */

const MANAGE_ROLES = ["Owner", "Admin", "Manager"];

function toPublic(device: DeviceDocument) {
  return {
    id: String(device._id),
    userId: String(device.userId),
    businessId: device.businessId ? String(device.businessId) : null,
    shopId: device.shopId ? String(device.shopId) : null,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    platform: device.platform,
    appVersion: device.appVersion,
    lastSeenAt: device.lastSeenAt,
    lastSyncAt: device.lastSyncAt,
    status: device.status,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}

async function assertManageAccess(userId: string, businessId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (!MANAGE_ROLES.includes(membership.role)) {
    throw ApiError.forbidden("Only Owner/Admin/Manager can manage devices");
  }
  return membership;
}

export interface RegisterDeviceInput {
  businessId: string;
  shopId?: string | null;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
}

export async function registerDevice(actorUserId: string, input: RegisterDeviceInput) {
  const membership = await membershipFor(actorUserId, input.businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  let shopId: Types.ObjectId | null = null;
  if (input.shopId) {
    const shop = await Shop.findOne({
      _id: new Types.ObjectId(input.shopId),
      businessId: new Types.ObjectId(input.businessId),
    });
    if (!shop) throw ApiError.notFound("Shop not found");
    // A shop-pinned member can only pin their own shop.
    if (membership.shopId && String(membership.shopId) !== input.shopId) {
      throw ApiError.notFound("Shop not found");
    }
    shopId = new Types.ObjectId(input.shopId);
  } else if (membership.shopId) {
    shopId = membership.shopId;
  }

  const existing = await Device.findOne({
    userId: new Types.ObjectId(actorUserId),
    deviceId: input.deviceId,
  });
  if (existing) {
    if (existing.status === "REVOKED") {
      throw ApiError.forbidden("Device is revoked");
    }
    existing.businessId = new Types.ObjectId(input.businessId);
    existing.shopId = shopId;
    existing.deviceName = input.deviceName ?? existing.deviceName;
    existing.platform = input.platform ?? existing.platform;
    existing.appVersion = input.appVersion ?? existing.appVersion;
    existing.lastSeenAt = new Date();
    await existing.save();
    return { ...toPublic(existing), duplicate: true };
  }

  const device = await Device.create({
    userId: new Types.ObjectId(actorUserId),
    businessId: new Types.ObjectId(input.businessId),
    shopId,
    deviceId: input.deviceId,
    deviceName: input.deviceName ?? "Unknown device",
    platform: input.platform ?? "android",
    appVersion: input.appVersion ?? "1.0.0",
  });

  await AuditLog.create([
    {
      userId: new Types.ObjectId(actorUserId),
      businessId: new Types.ObjectId(input.businessId),
      shopId,
      action: "DEVICE_REGISTERED",
      recordId: String(device._id),
      details: JSON.stringify({ deviceId: input.deviceId }),
    },
  ]);

  return { ...toPublic(device), duplicate: false };
}

export interface ListDevicesQuery {
  businessId: string;
  shopId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listDevices(actorUserId: string, query: ListDevicesQuery) {
  const membership = await assertManageAccess(actorUserId, query.businessId);
  const pagination = parsePagination(query as unknown as Record<string, unknown>);
  const filter: Record<string, unknown> = {
    businessId: new Types.ObjectId(query.businessId),
  };
  // Shop-pinned members only see their own shop's devices.
  const effectiveShopId =
    membership.shopId && query.shopId && String(membership.shopId) !== query.shopId
      ? null
      : (query.shopId ?? (membership.shopId ? String(membership.shopId) : null));
  if (effectiveShopId) filter.shopId = new Types.ObjectId(effectiveShopId);
  if (query.status) filter.status = query.status;

  const [total, devices] = await Promise.all([
    Device.countDocuments(filter),
    Device.find(filter)
      .sort({ updatedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate<{ userPhone?: string }>("userId", "phone"),
  ]);

  return {
    data: devices.map((d) => ({
      ...toPublic(d),
      // Presentation-only join: the account phone of the device owner.
      userPhone: (d.userId as unknown as { phone?: string })?.phone ?? null,
    })),
    pagination: buildPagination(total, pagination),
  };
}

export async function revokeDevice(
  actorUserId: string,
  businessId: string,
  deviceDocId: string
) {
  await assertManageAccess(actorUserId, businessId);
  if (!Types.ObjectId.isValid(deviceDocId)) throw ApiError.notFound("Device not found");

  const device = await Device.findOne({
    _id: new Types.ObjectId(deviceDocId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!device) throw ApiError.notFound("Device not found");

  if (device.status === "REVOKED") {
    return { ...toPublic(device), duplicate: true }; // idempotent re-revoke
  }

  device.status = "REVOKED";
  await device.save();

  // Terminate outstanding sessions: every live refresh token for this device.
  await RefreshToken.updateMany(
    { deviceId: device._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  await AuditLog.create([
    {
      userId: new Types.ObjectId(actorUserId),
      businessId: new Types.ObjectId(businessId),
      shopId: device.shopId,
      action: "DEVICE_REVOKED",
      recordId: String(device._id),
      details: JSON.stringify({
        deviceId: device.deviceId,
        ownerId: String(device.userId),
      }),
    },
  ]);

  return { ...toPublic(device), duplicate: false };
}

/** Sync heartbeat — a device may only update ITSELF (owner match enforced). */
export async function updateSync(
  actorUserId: string,
  businessId: string,
  deviceDocId: string
) {
  const membership = await membershipFor(actorUserId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (!Types.ObjectId.isValid(deviceDocId)) throw ApiError.notFound("Device not found");

  const device = await Device.findOne({
    _id: new Types.ObjectId(deviceDocId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!device) throw ApiError.notFound("Device not found");
  if (String(device.userId) !== actorUserId) {
    throw ApiError.forbidden("Only the device owner can report sync status");
  }
  if (device.status === "REVOKED") {
    throw ApiError.forbidden("Device is revoked");
  }

  const now = new Date();
  device.lastSyncAt = now;
  device.lastSeenAt = now;
  await device.save();

  return toPublic(device);
}