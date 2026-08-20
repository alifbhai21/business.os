import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { BusinessMembership } from "../models/BusinessMembership";
import { Shop } from "../models/Shop";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentBusiness?: { id: string; role: string; permissions: string[] };
      currentShopId?: string | null;
    }
  }
}

function requestedBusinessId(req: Request): string | null {
  const body = req.body as Record<string, unknown> | undefined;
  const query = req.query as Record<string, unknown>;
  const params = req.params as Record<string, unknown>;
  const v = body?.businessId ?? query?.businessId ?? params?.businessId ?? req.headers["x-business-id"];
  return v ? String(v) : null;
}

function requestedShopId(req: Request): string | null {
  const body = req.body as Record<string, unknown> | undefined;
  const query = req.query as Record<string, unknown>;
  const params = req.params as Record<string, unknown>;
  const v = body?.shopId ?? query?.shopId ?? params?.shopId;
  return v ? String(v) : null;
}

async function activeMembership(userId: string, businessId: string) {
  return BusinessMembership.findOne({
    userId: new Types.ObjectId(userId),
    businessId: new Types.ObjectId(businessId),
    status: "ACTIVE",
  });
}

/**
 * Resolve the target business from the request and verify the authenticated
 * user actually has an ACTIVE membership. Source of truth = membership,
 * never the client-supplied id alone. Wrong/unknown business => 404.
 */
export const resolveBusiness = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw ApiError.unauthorized("Authentication required");
    const businessId = requestedBusinessId(req);
    if (!businessId) throw ApiError.badRequest("businessId is required");
    const membership = await activeMembership(req.user.id, businessId);
    if (!membership) throw ApiError.notFound("Business not found");
    req.currentBusiness = {
      id: String(membership.businessId),
      role: membership.role,
      permissions: membership.permissions ?? [],
    };
    next();
  }
);

/**
 * Enforce shop-level scope. Requires resolveBusiness to have run.
 * A membership with a specific shopId may only access that shop;
 * a membership with null shopId is business-wide.
 *
 * The requested Shop must EXIST and must belong to the resolved Business
 * (Shop.businessId === currentBusiness.id). A client can never pair
 * businessId from Business A with a shopId owned by Business B — the
 * cross-tenant pairing resolves to 404 "Shop not found".
 */
export const assertShopAccess = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw ApiError.unauthorized("Authentication required");
    if (!req.currentBusiness) throw ApiError.forbidden("Business context required");
    const membership = await activeMembership(req.user.id, req.currentBusiness.id);
    if (!membership) throw ApiError.notFound("Business not found");
    const shopId = requestedShopId(req);
    if (shopId) {
      if (membership.shopId && String(membership.shopId) !== shopId) {
        throw ApiError.notFound("Shop not found");
      }
      if (!Types.ObjectId.isValid(shopId)) {
        throw ApiError.notFound("Shop not found");
      }
      const shop = await Shop.findOne({
        _id: new Types.ObjectId(shopId),
        businessId: new Types.ObjectId(req.currentBusiness.id),
      });
      if (!shop) throw ApiError.notFound("Shop not found");
      req.currentShopId = shopId;
    } else {
      req.currentShopId = membership.shopId ? String(membership.shopId) : null;
    }
    next();
  }
);