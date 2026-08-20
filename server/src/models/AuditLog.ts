import { Schema, model, Document, Types } from "mongoose";

export interface AuditLogDocument extends Document {
  userId: Types.ObjectId | null;
  businessId: Types.ObjectId | null;
  action: string;
  ip: string | null;
  details: string | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null },
  action: { type: String, required: true },
  ip: { type: String, default: null },
  details: { type: String, default: null },
}, {
  timestamps: true,
});

// Indexes for query patterns: audit trail by business + time
auditLogSchema.index({ businessId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });

export const AuditLog = model<AuditLogDocument>("AuditLog", auditLogSchema);