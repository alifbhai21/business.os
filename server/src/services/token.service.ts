import crypto from "crypto";
import jwt, { SignOptions, JwtPayload, TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export interface AccessTokenClaims {
  sub: string;
  userId: string;
  deviceId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPair {
  token: string;
  tokenHash: string;
}

/** SHA-256 hash used for storing refresh/reset tokens instead of raw values. */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Issue a short-lived JWT access token (expiry from env). */
export function signAccessToken(payload: {
  userId: string;
  deviceId: string;
  sessionId: string;
}): string {
  return jwt.sign(
    {
      userId: payload.userId,
      deviceId: payload.deviceId,
      sessionId: payload.sessionId,
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: payload.userId,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
    } as SignOptions
  );
}

/** Verify a JWT access token; throws ApiError(401) on invalid/expired. */
export function verifyAccessToken(token: string): AccessTokenClaims {
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
  } catch (err) {
    if (err instanceof TokenExpiredError || err instanceof JsonWebTokenError) {
      throw ApiError.unauthorized("Invalid or expired token");
    }
    throw ApiError.unauthorized("Invalid or expired token");
  }
  const payload = decoded as JwtPayload & {
    userId?: string;
    deviceId?: string;
    sessionId?: string;
  };
  if (!decoded.sub || !payload.userId || !payload.deviceId || !payload.sessionId) {
    throw ApiError.unauthorized("Invalid or expired token");
  }
  return {
    sub: decoded.sub,
    userId: payload.userId,
    deviceId: payload.deviceId,
    sessionId: payload.sessionId,
    iat: decoded.iat ?? 0,
    exp: decoded.exp ?? 0,
  };
}

/** Generate a fresh opaque refresh token with its stored hash. */
export function generateRefreshToken(): RefreshTokenPair {
  const token = randomToken(48);
  return { token, tokenHash: sha256(token) };
}

/** Compute a refresh-token expiry Date from env string (e.g. "30d"). */
export function refreshExpiryDate(): Date {
  const ms = msFromEnv(env.JWT_REFRESH_EXPIRES_IN);
  return new Date(Date.now() + ms);
}

function msFromEnv(expr: string): number {
  const match = /^(\d+)([smhd])$/.exec(expr);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 30 * 24 * 60 * 60 * 1000;
  }
}