import { Schema, model, Document, Types } from "mongoose";

/**
 * Phase 10 — sync event log.
 *
 * One row per /sync/push or /sync/pull call (per device per business). This
 * is the KPI/observability surface for the PRD sync-success-rate metric and
 * the audit trail for offline operations: which device pushed what, when,
 * with how many successes/failures/conflicts.
 *
 * Phase 11 — `RESTORE` records a full-data restore pulled by a (new) device
 * via GET /api/v1/sync/restore. Exactly one row per restore request.
 */
export interface SyncEventDocument extends Document {
  businessId: Types.ObjectId;
  userId: Types.ObjectId | null;
  deviceId: Types.ObjectId | null;
  direction: "PUSH" | "PULL" | "RESTORE";
  opCount: number;
  okCount: number;
  failedCount: number;
  conflictCount: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  error: string | null;
  createdAt: Date;
}

const syncEventSchema = new Schema<SyncEventDocument>({
  businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  // The verified Device from the JWT claims — never a client-supplied id.
  deviceId: { type: Schema.Types.ObjectId, ref: "Device", default: null },
  direction: { type: String, enum: ["PUSH", "PULL", "RESTORE"], required: true },
  opCount: { type: Number, default: 0 },
  okCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  conflictCount: { type: Number, default: 0 },
  status: { type: String, enum: ["SUCCESS", "PARTIAL", "FAILED"], required: true },
  error: { type: String, default: null },
}, {
  timestamps: true,
});

// Recent events per business (KPI queries) and per-device history.
syncEventSchema.index({ businessId: 1, createdAt: -1 });
syncEventSchema.index({ businessId: 1, deviceId: 1, createdAt: -1 });

export const SyncEvent = model<SyncEventDocument>("SyncEvent", syncEventSchema);
