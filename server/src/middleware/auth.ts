import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/token.service";
import { ApiError } from "../utils/ApiError";
import { User } from "../models/User";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role?: string;
  businessId?: string;
  /**
   * The Device the access token was issued to (05.13). Taken from the VERIFIED
   * JWT claims, never from the request body, so a client cannot attribute an
   * offline record to another device.
   */
  deviceId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Require a valid Bearer access token.
 * Sets req.user from verified JWT claims (never trusts client-provided user fields).
 *
 * Phase 12: for printable/exportable documents the token may alternatively
 * arrive as `?access_token=` (a browser cannot set Authorization headers when
 * opening a print view). Header form takes precedence; both are fully
 * verified identically.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const queryToken =
      typeof (req.query as Record<string, unknown>).access_token === "string"
        ? ((req.query as Record<string, unknown>).access_token as string)
        : null;
    const raw = header && header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : queryToken;
    if (!raw) {
      throw ApiError.unauthorized("Authentication required");
    }
    const claims = verifyAccessToken(raw);
    if (!claims.userId) {
      throw ApiError.unauthorized("Invalid token");
    }

    const user = await User.findById(claims.userId);
    if (!user) {
      throw ApiError.unauthorized("User no longer exists");
    }
    if (user.status !== "ACTIVE") {
      throw ApiError.forbidden("Account is not active");
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      deviceId: claims.deviceId,
    };
    next();
  } catch (err) {
    next(err);
  }
}