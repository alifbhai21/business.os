import { Types, ClientSession } from "mongoose";
import { Product } from "../models/Product";
import { StockMovement } from "../models/StockMovement";
import { Shop } from "../models/Shop";
import { AuditLog } from "../models/AuditLog";
import { membershipFor, isDuplicateKeyError } from "./membership";
import { withTransaction } from "../db/transactions";
import { assertSafePaisa } from "../utils/money";
import { parsePagination, buildPagination } from "../utils/pagination";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 06 — Inventory service.
 *
 * The atomic stock engine: every change to Product.currentStock is a guarded
 * `$inc` inside a MongoDB transaction, accompanied by exactly one immutable
 * StockMovement. The product document is a cached running total; the movement
 * ledger is the source of truth for reconstruction.
 */

const INVENTORY_WRITE_ROLES = ["Owner", "Admin", "Manager", "Inventory Manager"] as const;

async function assertAccess(userId: string, businessId: string, shopId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  return membership;
}

async function assertCanAdjust(userId: string, businessId: string, shopId: string) {
  const membership = await assertAccess(userId, businessId, shopId);
  if (!(INVENTORY_WRITE_ROLES as readonly string[]).includes(membership.role)) {
    throw ApiError.forbidden("Insufficient role");
  }
  return membership;
}

/**
 * Apply a signed stock change to a product with an immutable movement, inside
 * the caller's transaction. `qtyChange` is signed (negative = stock out).
 * `allowNegative` bypasses the never-negative guard (Business.allowNegativeStock).
 */
export async function applyStockChange(
  userId: string,
  businessId: string,
  shopId: string,
  productId: string,
  qtyChange: number,
  type: "adjustment" | "damage" | "opening" | "sale_return" | "purchase_return" | "transfer",
  refType: "ADJUSTMENT" | "DAMAGE" | "OPENING" | "SALE_RETURN" | "PURCHASE_RETURN" | "TRANSFER",
  refId: Types.ObjectId,
  unitCost: number,
  allowNegative: boolean,
  session: ClientSession | null
): Promise<void> {
  assertSafePaisa(qtyChange, "qtyChange");
  if (qtyChange === 0) throw ApiError.badRequest("qtyChange must be non-zero");

  const product = await Product.findOne({
    _id: new Types.ObjectId(productId),
    businessId: new Types.ObjectId(businessId),
  }).session(session);
  if (!product) throw ApiError.notFound("Product not found");

  const guard = allowNegative ? {} : { currentStock: { $gte: -qtyChange } };
  const previous = await Product.findOneAndUpdate(
    { _id: product._id, businessId: product.businessId, ...guard },
    { $inc: { currentStock: qtyChange } },
    { new: false, session: session ?? undefined }
  );
  if (!previous) {
    throw ApiError.badRequest(`Insufficient stock for ${product.name}`);
  }

  await StockMovement.create(
    [
      {
        businessId: new Types.ObjectId(businessId),
        shopId: new Types.ObjectId(shopId),
        productId: product._id,
        type,
        qtyChange,
        prevStock: previous.currentStock,
        newStock: previous.currentStock + qtyChange,
        unitCost,
        refType,
        refId,
        createdBy: new Types.ObjectId(userId),
      },
    ],
    { session: session ?? undefined, ordered: true }
  );
}

export interface AdjustStockInput {
  businessId: string;
  shopId: string;
  productId: string;
  /** Signed change: positive = add stock, negative = remove stock. */
  qtyChange: number;
  reason: string;
  /** "adjustment" (correction) or "damage" (damaged/expired stock). */
  kind: "adjustment" | "damage";
  localId?: string | null;
}

export async function adjustStock(
  userId: string,
  input: AdjustStockInput
): Promise<{ id: string; productId: string; qtyChange: number; newStock: number }> {
  await assertCanAdjust(userId, input.businessId, input.shopId);
  assertSafePaisa(input.qtyChange, "qtyChange");
  if (input.qtyChange === 0) throw ApiError.badRequest("qtyChange must be non-zero");
  if (!input.reason.trim()) throw ApiError.badRequest("reason is required");

  const result = await withTransaction(async (session) => {
    const business = await requireBusiness(input.businessId, session);
    const product = await Product.findOne({
      _id: new Types.ObjectId(input.productId),
      businessId: new Types.ObjectId(input.businessId),
    }).session(session);
    if (!product) throw ApiError.notFound("Product not found");

    const refId = new Types.ObjectId();
    await applyStockChange(
      userId,
      input.businessId,
      input.shopId,
      input.productId,
      input.qtyChange,
      input.kind,
      input.kind === "damage" ? "DAMAGE" : "ADJUSTMENT",
      refId,
      product.avgCost,
      business.allowNegativeStock,
      session
    );

    const fresh = await Product.findById(product._id).session(session);
    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: new Types.ObjectId(input.businessId),
          action: input.kind === "damage" ? "STOCK_DAMAGED" : "STOCK_ADJUSTED",
          ip: null,
          details: JSON.stringify({
            productId: input.productId,
            shopId: input.shopId,
            qtyChange: input.qtyChange,
            newStock: fresh!.currentStock,
            reason: input.reason,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return {
      id: String(refId),
      productId: input.productId,
      qtyChange: input.qtyChange,
      newStock: fresh!.currentStock,
    };
  });

  return result;
}

export interface OpeningStockInput {
  businessId: string;
  shopId: string;
  productId: string;
  /** The opening quantity to set. The movement records the delta from 0. */
  quantity: number;
  localId?: string | null;
}

export async function setOpeningStock(
  userId: string,
  input: OpeningStockInput
): Promise<{ productId: string; quantity: number }> {
  await assertCanAdjust(userId, input.businessId, input.shopId);
  assertSafePaisa(input.quantity, "quantity");
  if (input.quantity < 0) throw ApiError.badRequest("quantity must be >= 0");

  const result = await withTransaction(async (session) => {
    const product = await Product.findOne({
      _id: new Types.ObjectId(input.productId),
      businessId: new Types.ObjectId(input.businessId),
    }).session(session);
    if (!product) throw ApiError.notFound("Product not found");
    if (product.currentStock !== 0) {
      throw ApiError.badRequest("Opening stock can only be set when current stock is 0");
    }

    const refId = new Types.ObjectId();
    if (input.quantity > 0) {
      await applyStockChange(
        userId,
        input.businessId,
        input.shopId,
        input.productId,
        input.quantity,
        "opening",
        "OPENING",
        refId,
        product.avgCost,
        true,
        session
      );
    }

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: new Types.ObjectId(input.businessId),
          action: "STOCK_OPENING_SET",
          ip: null,
          details: JSON.stringify({
            productId: input.productId,
            shopId: input.shopId,
            quantity: input.quantity,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { productId: input.productId, quantity: input.quantity };
  });

  return result;
}

export interface ListStockQuery {
  page?: unknown;
  limit?: unknown;
  lowStock?: unknown;
  search?: unknown;
  categoryId?: unknown;
}

export async function listStock(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ListStockQuery = {}
) {
  let effectiveShopId: string | null = shopId ?? null;
  if (shopId) {
    await assertAccess(userId, businessId, shopId);
  } else {
    const membership = await membershipFor(userId, businessId);
    if (!membership) throw ApiError.notFound("Business not found");
    if (membership.shopId) effectiveShopId = String(membership.shopId);
  }

  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (typeof query.search === "string" && query.search.trim()) {
    filter.name = { $regex: query.search.trim(), $options: "i" };
  }
  if (typeof query.categoryId === "string" && Types.ObjectId.isValid(query.categoryId)) {
    filter.categoryId = new Types.ObjectId(query.categoryId);
  }

  const pagination = parsePagination(query as Record<string, unknown>);
  const baseFilter = { ...filter };
  if (query.lowStock === "true") {
    // Low stock: currentStock <= minStock (and minStock > 0).
    baseFilter.$expr = { $and: [{ $gt: ["$minStock", 0] }, { $lte: ["$currentStock", "$minStock"] }] };
  }

  const [total, rows] = await Promise.all([
    Product.countDocuments(baseFilter),
    Product.find(baseFilter)
      .sort({ name: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  return {
    items: rows.map((p) => ({
      id: String(p._id),
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      unit: p.unit,
      currentStock: p.currentStock,
      minStock: p.minStock,
      maxStock: p.maxStock,
      avgCost: p.avgCost,
      lowStock: p.minStock > 0 && p.currentStock <= p.minStock,
    })),
    pagination: buildPagination(total, pagination),
  };
}

export interface ListMovementsQuery {
  page?: unknown;
  limit?: unknown;
  productId?: unknown;
  type?: unknown;
}

export async function listMovements(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ListMovementsQuery = {}
) {
  let effectiveShopId: string | null = shopId ?? null;
  if (shopId) {
    await assertAccess(userId, businessId, shopId);
  } else {
    const membership = await membershipFor(userId, businessId);
    if (!membership) throw ApiError.notFound("Business not found");
    if (membership.shopId) effectiveShopId = String(membership.shopId);
  }

  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (effectiveShopId) filter.shopId = new Types.ObjectId(effectiveShopId);
  if (typeof query.productId === "string" && Types.ObjectId.isValid(query.productId)) {
    filter.productId = new Types.ObjectId(query.productId);
  }
  if (typeof query.type === "string") filter.type = query.type;

  const pagination = parsePagination(query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    StockMovement.countDocuments(filter),
    StockMovement.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  return {
    items: rows.map((m) => ({
      id: String(m._id),
      productId: String(m.productId),
      shopId: String(m.shopId),
      type: m.type,
      qtyChange: m.qtyChange,
      prevStock: m.prevStock,
      newStock: m.newStock,
      unitCost: m.unitCost,
      refType: m.refType,
      refId: String(m.refId),
      createdAt: m.createdAt,
    })),
    pagination: buildPagination(total, pagination),
  };
}

async function requireBusiness(businessId: string, session: ClientSession | null) {
  const { Business } = await import("../models/Business");
  const business = await Business.findById(new Types.ObjectId(businessId)).session(session);
  if (!business) throw ApiError.notFound("Business not found");
  return business;
}