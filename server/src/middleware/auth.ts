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
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Authentication required");
    }
    const token = header.slice("Bearer ".length).trim();
    const claims = verifyAccessToken(token);
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