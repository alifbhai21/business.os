import { Schema, model, Document, Types } from "mongoose";

export type DeviceStatus = "ACTIVE" | "REVOKED";

export interface DeviceDocument extends Document {
  userId: Types.ObjectId;
  businessId: Types.ObjectId | null;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  lastSeenAt: Date;
  status: DeviceStatus;
  createdAt: Date;
  updatedAt: Date;
}

const deviceSchema = new Schema<DeviceDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null },
    deviceId: { type: String, required: true },
    deviceName: { type: String, required: true },
    platform: { type: String, default: "android" },
    appVersion: { type: String, default: "1.0.0" },
    lastSeenAt: { type: Date, default: Date.now },
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

export const Device = model<DeviceDocument>("Device", deviceSchema);