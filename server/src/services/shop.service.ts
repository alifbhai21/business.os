import { Types } from "mongoose";
import { Shop, ShopDocument, ShopStatus } from "../models/Shop";
import { Account } from "../models/Account";
import { BusinessMembership } from "../models/BusinessMembership";
import { DEFAULT_CASH_ACCOUNT_NAME } from "../config/accounts";
import { withTransaction } from "../db/transactions";
import { ApiError } from "../utils/ApiError";

export interface CreateShopInput {
  businessId: string;
  name: string;
  branchCode: string;
  address?: string | null;
  phone?: string | null;
  manager?: string | null;
  isWarehouse?: boolean;
  openingCash?: number;
}

export interface UpdateShopInput {
  name?: string;
  branchCode?: string;
  address?: string | null;
  phone?: string | null;
  manager?: string | null;
  isWarehouse?: boolean;
}

function toPublic(shop: ShopDocument) {
  return {
    id: String(shop._id),
    businessId: String(shop.businessId),
    name: shop.name,
    branchCode: shop.branchCode,
    address: shop.address,
    phone: shop.phone,
    manager: shop.manager,
    isWarehouse: shop.isWarehouse,
    openingCash: shop.openingCash,
    status: shop.status,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  };
}

async function membershipFor(userId: string, businessId: string) {
  return BusinessMembership.findOne({
    userId: new Types.ObjectId(userId),
    businessId: new Types.ObjectId(businessId),
    status: "ACTIVE",
  });
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === 11000
  );
}

export async function createShop(userId: string, input: CreateShopInput) {
  const membership = await membershipFor(userId, input.businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const openingCash = input.openingCash ?? 0; // integer paisa (per Shop schema)
  let shop: ShopDocument;
  try {
    shop = await withTransaction(async (session) => {
      const created = await Shop.create(
        [
          {
            businessId: new Types.ObjectId(input.businessId),
            name: input.name,
            branchCode: input.branchCode,
            address: input.address ?? null,
            phone: input.phone ?? null,
            manager: input.manager ?? null,
            isWarehouse: input.isWarehouse ?? false,
            openingCash,
          },
        ],
        { session }
      );
      // Default Cash Account seeded from Shop.openingCash.
      // Shop.openingCash remains the original seed input; the Account
      // balance is the authoritative financial balance going forward.
      await Account.create(
        [
          {
            businessId: new Types.ObjectId(input.businessId),
            shopId: created[0]._id,
            name: DEFAULT_CASH_ACCOUNT_NAME,
            type: "CASH",
            currentBalance: openingCash,
          },
        ],
        { session }
      );
      return created[0];
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict("A shop with this branch code already exists in this business");
    }
    throw err;
  }
  return toPublic(shop);
}

export async function listShops(userId: string, businessId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const shops = await Shop.find({ businessId: new Types.ObjectId(businessId) });
  return shops.map(toPublic);
}

export async function getShop(userId: string, businessId: string, shopId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const shop = await Shop.findOne({
    _id: new Types.ObjectId(shopId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!shop) throw ApiError.notFound("Shop not found");
  return toPublic(shop);
}

export async function updateShop(
  userId: string,
  businessId: string,
  shopId: string,
  input: UpdateShopInput
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.role !== "Owner" && membership.role !== "Admin") {
    throw ApiError.forbidden("Only Owner/Admin can update shops");
  }
  const shop = await Shop.findOne({
    _id: new Types.ObjectId(shopId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!shop) throw ApiError.notFound("Shop not found");
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.branchCode !== undefined) patch.branchCode = input.branchCode;
  if (input.address !== undefined) patch.address = input.address;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.manager !== undefined) patch.manager = input.manager;
  if (input.isWarehouse !== undefined) patch.isWarehouse = input.isWarehouse;
  Object.assign(shop, patch);
  await shop.save();
  return toPublic(shop);
}

export async function updateShopStatus(
  userId: string,
  businessId: string,
  shopId: string,
  status: ShopStatus
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.role !== "Owner" && membership.role !== "Admin") {
    throw ApiError.forbidden("Only Owner/Admin can change shop status");
  }
  const shop = await Shop.findOne({
    _id: new Types.ObjectId(shopId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!shop) throw ApiError.notFound("Shop not found");
  shop.status = status;
  await shop.save();
  return toPublic(shop);
}