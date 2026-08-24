import { Schema, model, Document, Types } from "mongoose";

export type DeviceStatus = "ACTIVE" | "REVOKED";

export interface DeviceDocument extends Document {
  userId: Types.ObjectId;
  businessId: Types.ObjectId | null;
  /** Phase 09 — shop pinning for business-scoped device management. */
  shopId: Types.ObjectId | null;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  lastSeenAt: Date;
  /** Phase 09 — last successful offline-sync heartbeat. */
  lastSyncAt: Date | null;
  /**
   * Phase 12 — FCM registration token for push delivery of in-app
   * notifications. Infrastructure-only until Firebase credentials are
   * provisioned (delivery is documented as blocked, not implemented).
   */
  fcmToken: string | null;
  status: DeviceStatus;
  createdAt: Date;
  updatedAt: Date;
}

const deviceSchema = new Schema<DeviceDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
    deviceId: { type: String, required: true },
    deviceName: { type: String, required: true },
    platform: { type: String, default: "android" },
    appVersion: { type: String, default: "1.0.0" },
    lastSeenAt: { type: Date, default: Date.now },
    lastSyncAt: { type: Date, default: null },
    fcmToken: { type: String, default: null, trim: true, maxlength: 255 },
    status: { type: String, enum: ["ACTIVE", "REVOKED"], default: "ACTIVE" },
  },
  {
    timestamps: true,
  }
);

// Indexes for query patterns
deviceSchema.index({ userId: 1 });
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ businessId: 1 });
// Phase 09 — business-scoped device listing with status filter.
deviceSchema.index({ businessId: 1, status: 1 });

export const Device = model<DeviceDocument>("Device", deviceSchema);