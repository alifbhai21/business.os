import { Schema, model, Document, Types } from "mongoose";

export interface RefreshTokenDocument extends Document {
  userId: Types.ObjectId;
  deviceId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenHash: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

// Indexes for query patterns (tokenHash is unique so its index is implicit)
refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ expiresAt: 1 });

export const RefreshToken = model<RefreshTokenDocument>(
  "RefreshToken",
  refreshTokenSchema
);
