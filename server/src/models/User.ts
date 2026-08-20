import { Schema, model, models, Document } from "mongoose";

export type UserStatus = "ACTIVE" | "LOCKED" | "SUSPENDED";

export interface UserDocument extends Document {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  status: UserStatus;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  resetPasswordTokenHash: string | null;
  resetPasswordExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "LOCKED", "SUSPENDED"],
      default: "ACTIVE",
    },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

export const User = model<UserDocument>("User", userSchema);
