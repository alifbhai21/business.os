import { Schema, model, Document, Types } from "mongoose";

/**
 * Phase 12 — in-app notifications.
 *
 * Operational alerts (low stock, customer over credit limit, supplier
 * payable outstanding, sync failures) materialized LAZILY by the read path:
 * `evaluateAndMaterialize()` scans current conditions and upserts rows keyed
 * by a deterministic `dedupKey` behind a unique per-business index. That
 * makes generation idempotent (one row per condition per day-bucket) with
 * ZERO writes inside the verified Phase 05–10 financial transactions.
 *
 * Read-state is per USER and lives in NotificationRead ({userId,
 * notificationId} unique), so a business-wide alert can be acknowledged by
 * each member independently without fanning out one row per recipient.
 */

export const NOTIFICATION_TYPES = [
  "LOW_STOCK",
  "CUSTOMER_DUE",
  "SUPPLIER_DUE",
  "SYNC_FAILURE",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDocument extends Document {
  businessId: Types.ObjectId;
  /** Shop scope of the triggering condition (null = business-wide). */
  shopId: Types.ObjectId | null;
  type: NotificationType;
  title: string;
  body: string;
  /** Deterministic idempotency key, e.g. LOW_STOCK:<productId>:<YYYY-MM-DD>. */
  dedupKey: string;
  refType: string | null;
  refId: string | null;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>({
  businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
  type: { type: String, enum: [...NOTIFICATION_TYPES], required: true },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 500 },
  dedupKey: { type: String, required: true, maxlength: 200 },
  refType: { type: String, default: null },
  refId: { type: String, default: null },
}, {
  timestamps: true,
});

// Idempotent materialization: one row per business per dedupKey.
notificationSchema.index({ businessId: 1, dedupKey: 1 }, { unique: true });
// List reads: newest first per business (+ shop-pinned variant).
notificationSchema.index({ businessId: 1, createdAt: -1 });

export const Notification = model<NotificationDocument>("Notification", notificationSchema);

/** Per-user acknowledgement of a business-wide notification. */
export interface NotificationReadDocument extends Document {
  userId: Types.ObjectId;
  notificationId: Types.ObjectId;
  readAt: Date;
}

const notificationReadSchema = new Schema<NotificationReadDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  notificationId: { type: Schema.Types.ObjectId, ref: "Notification", required: true },
  readAt: { type: Date, default: () => new Date() },
});

// A user acknowledges a notification exactly once.
notificationReadSchema.index({ userId: 1, notificationId: 1 }, { unique: true });
// Unread counts / mark-all-read scans.
notificationReadSchema.index({ notificationId: 1 });

export const NotificationRead = model<NotificationReadDocument>(
  "NotificationRead",
  notificationReadSchema
);

/**
 * Phase 12 — per-user notification preferences. Absent doc = all types ON.
 * Toggles only ever SUPPRESS generation; they can never invent permissions.
 */
export const PREFERENCE_KEYS = [
  "lowStock",
  "customerDue",
  "supplierDue",
  "syncFailure",
] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

export interface NotificationPreferenceDocument extends Document {
  userId: Types.ObjectId;
  businessId: Types.ObjectId;
  toggles: Record<PreferenceKey, boolean>;
  updatedAt: Date;
}

const notificationPreferenceSchema = new Schema<NotificationPreferenceDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
  toggles: {
    lowStock: { type: Boolean, default: true },
    customerDue: { type: Boolean, default: true },
    supplierDue: { type: Boolean, default: true },
    syncFailure: { type: Boolean, default: true },
  },
}, {
  timestamps: true,
});

notificationPreferenceSchema.index({ userId: 1, businessId: 1 }, { unique: true });

export const NotificationPreference = model<NotificationPreferenceDocument>(
  "NotificationPreference",
  notificationPreferenceSchema
);
