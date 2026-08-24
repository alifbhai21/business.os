import { Schema, model, Document, Types } from "mongoose";

export interface AuditLogDocument extends Document {
  userId: Types.ObjectId | null;
  businessId: Types.ObjectId | null;
  /** Phase 09 — shop scope of the audited action (null = business-wide). */
  shopId: Types.ObjectId | null;
  action: string;
  ip: string | null;
  details: string | null;
  /** Phase 09 — the affected document's id, when the action targets a record. */
  recordId: string | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null },
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
  action: { type: String, required: true },
  ip: { type: String, default: null },
  details: { type: String, default: null },
  recordId: { type: String, default: null },
}, {
  timestamps: true,
});

// Indexes for query patterns: audit trail by business + time
auditLogSchema.index({ businessId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
// Phase 09 — audit read API filter patterns.
auditLogSchema.index({ businessId: 1, shopId: 1, createdAt: -1 });
auditLogSchema.index({ businessId: 1, action: 1, createdAt: -1 });

export const AuditLog = model<AuditLogDocument>("AuditLog", auditLogSchema);