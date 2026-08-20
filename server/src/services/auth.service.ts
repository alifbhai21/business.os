import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { User } from "../models/User";
import { RefreshToken } from "../models/RefreshToken";
import { Device } from "../models/Device";
import { AuditLog } from "../models/AuditLog";
import { BusinessMembership } from "../models/BusinessMembership";
import {
  generateRefreshToken,
  refreshExpiryDate,
  sha256,
  signAccessToken,
} from "./token.service";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";
import { env } from "../config/env";

export interface DeviceInput {
  deviceId: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
}

export interface RegisterInput extends DeviceInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface LoginInput extends DeviceInput {
  email: string;
  password: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export function toSafeUser(user: {
  _id: unknown;
  name: string;
  email: string;
  phone: string;
  status?: string;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status ?? "ACTIVE",
  };
}

async function logAudit(
  action: string,
  userId: string | null,
  businessId: string | null,
  details?: string
) {
  try {
    await AuditLog.create({
      userId: userId ? new Types.ObjectId(userId) : null,
      businessId: businessId ? new Types.ObjectId(businessId) : null,
      action,
      details: details ?? null,
    });
  } catch (err) {
    logger.error(`Audit log write failed for ${action}: ${(err as Error).message}`);
  }
}

function sessionId(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function upsertDevice(
  userId: Types.ObjectId,
  businessId: string | null,
  input: DeviceInput
) {
  const existing = await Device.findOne({ deviceId: input.deviceId, userId });
  if (existing) {
    if (existing.status === "REVOKED") {
      throw ApiError.unauthorized("Device is revoked");
    }
    existing.deviceName = input.deviceName ?? existing.deviceName;
    existing.platform = input.platform ?? existing.platform;
    existing.appVersion = input.appVersion ?? existing.appVersion;
    existing.lastSeenAt = new Date();
    await existing.save();
    return existing;
  }

  const device = await Device.create({
    userId: new Types.ObjectId(userId),
    businessId: businessId ? new Types.ObjectId(businessId) : null,
    deviceId: input.deviceId,
    deviceName: input.deviceName ?? "Unknown device",
    platform: input.platform ?? "android",
    appVersion: input.appVersion ?? "1.0.0",
  });
  await logAudit("DEVICE_REGISTERED", String(userId), businessId, `deviceId=${input.deviceId}`);
  return device;
}

async function issueTokens(userId: string, deviceId: string): Promise<IssuedTokens> {
  const sid = sessionId();
  const accessToken = signAccessToken({ userId, deviceId, sessionId: sid });
  const { token, tokenHash } = generateRefreshToken();
  await RefreshToken.create({
    userId: new Types.ObjectId(userId),
    deviceId: new Types.ObjectId(deviceId),
    tokenHash,
    expiresAt: refreshExpiryDate(),
  });
  return { accessToken, refreshToken: token, sessionId: sid };
}

const BCRYPT_COST = 10;

export async function register(input: RegisterInput) {
  const normalizedEmail = input.email.trim().toLowerCase();

  const existing = await User.findOne({
    $or: [{ email: normalizedEmail }, { phone: input.phone.trim() }],
  });
  if (existing) {
    throw ApiError.conflict("An account with this email or phone already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const user = await User.create({
    name: input.name.trim(),
    email: normalizedEmail,
    phone: input.phone.trim(),
    passwordHash,
  });

  // Register creates the account/auth foundation only.
  // The user explicitly creates their real Business during onboarding
  // (POST /api/v1/businesses → Owner membership is created server-side there).
  const device = await upsertDevice(user._id as Types.ObjectId, null, input);
  const tokens = await issueTokens(String(user._id), String(device._id));

  await logAudit("REGISTER", String(user._id), null);

  return {
    user: toSafeUser(user as never),
    businessId: null,
    ...tokens,
  };
}

export async function login(input: LoginInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    // Generic response — do not reveal account existence.
    throw ApiError.unauthorized("Invalid credentials");
  }

  if (user.status === "SUSPENDED") {
    throw ApiError.forbidden("Account is suspended");
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw ApiError.unauthorized("Account is temporarily locked");
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const max = env.AUTH_MAX_LOGIN_ATTEMPTS;
    if (attempts >= max) {
      user.failedLoginAttempts = attempts;
      user.lockedUntil = new Date(Date.now() + env.AUTH_LOCKOUT_MINUTES * 60 * 1000);
      user.status = "LOCKED";
      await user.save();
      await logAudit("ACCOUNT_LOCKED", String(user._id), null, "too many failed logins");
      throw ApiError.unauthorized("Too many failed attempts. Account locked temporarily.");
    }
    user.failedLoginAttempts = attempts;
    await user.save();
    await logAudit("LOGIN_FAILED", String(user._id), null);
    throw ApiError.unauthorized("Invalid email or password");
  }

  // Successful login resets lockout state.
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  if (user.status === "LOCKED") user.status = "ACTIVE";
  user.lastLoginAt = new Date();
  await user.save();

  const membership = await BusinessMembership.findOne({ userId: user._id, status: "ACTIVE" });
  const businessId = membership ? String(membership.businessId) : null;

  const device = await upsertDevice(user._id as Types.ObjectId, businessId, input);
  const tokens = await issueTokens(String(user._id), String(device._id));

  await logAudit("LOGIN_SUCCESS", String(user._id), businessId);

  return {
    user: toSafeUser(user as never),
    businessId,
    ...tokens,
  };
}

export async function refresh(refreshToken: string, deviceId: string) {
  const tokenHash = sha256(refreshToken);
  const record = await RefreshToken.findOne({ tokenHash });
  if (!record) {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  if (record.revokedAt) {
    // Token reuse — treat as a security event and revoke all this user's sessions.
    await RefreshToken.updateMany(
      { userId: record.userId, revokedAt: null },
      { revokedAt: new Date() }
    );
    await logAudit("TOKEN_REUSE_DETECTED", String(record.userId), null);
    throw ApiError.unauthorized("Refresh token has been reused");
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized("Refresh token has expired");
  }

  // Rotation: revoke old, create new.
  const newPair = generateRefreshToken();
  await RefreshToken.updateOne(
    { _id: record._id },
    { revokedAt: new Date(), replacedByTokenHash: newPair.tokenHash }
  );
  await RefreshToken.create({
    userId: record.userId,
    deviceId: record.deviceId,
    tokenHash: newPair.tokenHash,
    expiresAt: refreshExpiryDate(),
  });

  const user = await User.findById(record.userId);
  if (!user) throw ApiError.unauthorized("User not found");

  const accessToken = signAccessToken({
    userId: String(user._id),
    deviceId: String(record.deviceId),
    sessionId: sessionId(),
  });

  await logAudit("TOKEN_REFRESH", String(user._id), null);

  return {
    accessToken,
    refreshToken: newPair.token,
    sessionId: sessionId(),
  };
}

async function revokeAllForUser(userId: string) {
  await RefreshToken.updateMany(
    { userId: new Types.ObjectId(userId), revokedAt: null },
    { revokedAt: new Date() }
  );
}

export async function logout(refreshToken: string) {
  const tokenHash = sha256(refreshToken);
  const record = await RefreshToken.findOne({ tokenHash });
  if (record) {
    record.revokedAt = new Date();
    await record.save();
    await logAudit("LOGOUT", String(record.userId), null);
  }
}

export async function logoutAll(userId: string) {
  await revokeAllForUser(userId);
  await logAudit("LOGOUT_ALL", userId, null);
}

export async function forgotPassword(email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalized });
  // Always generic — do not reveal whether the account exists.
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    user.resetPasswordTokenHash = sha256(token);
    user.resetPasswordExpiresAt = expiresAt;
    await user.save();
    // Delivery provider is NOT integrated in Phase 02; token is text-only in dev/test.
    await logAudit("PASSWORD_RESET_REQUEST", String(user._id), null);
    return { email: user.email, resetToken: token }; // dev-safe; replace with email provider later
  }
  return { email: normalized, resetToken: null };
}

/** Reset password via a single-use hashed token; invalidates all sessions. */
export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = sha256(token);
  const user = await User.findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpiresAt: { $gt: new Date() },
  });
  if (!user) {
    throw ApiError.badRequest("Invalid or expired reset token");
  }
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  // Consume token (single-use).
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();
  // Invalidate existing sessions.
  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { revokedAt: new Date() }
  );
  await logAudit("PASSWORD_RESET_SUCCESS", String(user._id), null);
}

/** Load the current user + memberships for GET /auth/me. */
export async function getMe(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  const memberships = await BusinessMembership.find({ userId: user._id });
  return {
    user: toSafeUser(user as never),
    memberships: memberships.map((m) => ({
      businessId: String(m.businessId),
      shopId: m.shopId ? String(m.shopId) : null,
      role: m.role,
      status: m.status,
    })),
  };
}
