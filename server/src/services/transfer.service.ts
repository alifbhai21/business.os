import { Types } from "mongoose";
import { StockTransfer, StockTransferDocument, STOCK_TRANSFER_STATUSES } from "../models/StockTransfer";
import { StockMovement } from "../models/StockMovement";
import { Product } from "../models/Product";
import { Shop } from "../models/Shop";
import { Business } from "../models/Business";
import { AuditLog } from "../models/AuditLog";
import { membershipFor } from "./membership";
import { withTransaction } from "../db/transactions";
import { assertSafePaisa } from "../utils/money";
import { parsePagination, buildPagination } from "../utils/pagination";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 06 — Stock transfers between two shops of the SAME business.
 *
 * A transfer moves stock from `sourceShopId` to `destShopId`:
 *   - creating the transfer writes a `transfer` StockMovement (qtyChange
 *     negative) on the SOURCE shop's product,
 *   - marking it RECEIVED writes a `transfer` StockMovement (qtyChange
 *     positive) on the DESTINATION shop's product.
 *
 * Both movements are immutable and reference the same StockTransfer document
 * (refType TRANSFER / refId). The source and destination are different shops
 * of the same business; the product is the same logical product (stock is
 * per-shop on the Product document, so the transfer moves the quantity between
 * the two shop-scoped stock figures).
 *
 * Concurrency safety: the source decrement is a guarded atomic `$inc` so two
 * concurrent transfers can never over-draw the source shop's stock.
 */

const TRANSFER_WRITE_ROLES = ["Owner", "Admin", "Manager", "Inventory Manager"] as const;

async function assertAccess(userId: string, businessId: string, shopId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  return membership;
}

async function assertCanTransfer(userId: string, businessId: string, shopId: string) {
  const membership = await assertAccess(userId, businessId, shopId);
  if (!(TRANSFER_WRITE_ROLES as readonly string[]).includes(membership.role)) {
    throw ApiError.forbidden("Insufficient role");
  }
  return membership;
}

function toPublic(t: StockTransferDocument) {
  return {
    id: String(t._id),
    businessId: String(t.businessId),
    sourceShopId: String(t.sourceShopId),
    destShopId: String(t.destShopId),
    productId: String(t.productId),
    quantity: t.quantity,
    status: t.status,
    notes: t.notes,
    localId: t.localId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export interface CreateTransferInput {
  businessId: string;
  sourceShopId: string;
  destShopId: string;
  productId: string;
  quantity: number;
  notes?: string | null;
  localId?: string | null;
}

export async function createTransfer(
  userId: string,
  input: CreateTransferInput
): Promise<{ transfer: ReturnType<typeof toPublic>; duplicate: boolean }> {
  await assertCanTransfer(userId, input.businessId, input.sourceShopId);
  assertSafePaisa(input.quantity, "quantity");
  if (input.quantity <= 0) throw ApiError.badRequest("quantity must be > 0");
  if (input.sourceShopId === input.destShopId) {
    throw ApiError.badRequest("Source and destination shops must be different");
  }

  const result = await withTransaction(async (session) => {
    // Offline-sync idempotency: the same localId never creates a second transfer.
    if (input.localId) {
      const existing = await StockTransfer.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      }).session(session);
      if (existing) return { transfer: existing, duplicate: true };
    }

    const business = await Business.findById(new Types.ObjectId(input.businessId)).session(session);
    if (!business) throw ApiError.notFound("Business not found");

    // Both shops must belong to this business.
    const sourceShop = await Shop.findOne({
      _id: new Types.ObjectId(input.sourceShopId),
      businessId: new Types.ObjectId(input.businessId),
    }).session(session);
    if (!sourceShop) throw ApiError.notFound("Source shop not found");
    const destShop = await Shop.findOne({
      _id: new Types.ObjectId(input.destShopId),
      businessId: new Types.ObjectId(input.businessId),
    }).session(session);
    if (!destShop) throw ApiError.notFound("Destination shop not found");

    const product = await Product.findOne({
      _id: new Types.ObjectId(input.productId),
      businessId: new Types.ObjectId(input.businessId),
    }).session(session);
    if (!product) throw ApiError.notFound("Product not found");

    const created = await StockTransfer.create(
      [
        {
          businessId: new Types.ObjectId(input.businessId),
          sourceShopId: new Types.ObjectId(input.sourceShopId),
          destShopId: new Types.ObjectId(input.destShopId),
          productId: product._id,
          quantity: input.quantity,
          status: "PENDING",
          notes: input.notes ?? null,
          createdBy: new Types.ObjectId(userId),
          localId: input.localId ?? null,
        },
      ],
      { session: session ?? undefined, ordered: true }
    );
    const transfer = created[0];

    // Source shop: guarded stock decrement + transfer_out movement.
    const guard = business.allowNegativeStock ? {} : { currentStock: { $gte: input.quantity } };
    const previous = await Product.findOneAndUpdate(
      { _id: product._id, businessId: product.businessId, ...guard },
      { $inc: { currentStock: -input.quantity } },
      { new: false, session: session ?? undefined }
    );
    if (!previous) {
      throw ApiError.badRequest(`Insufficient stock in source shop for ${product.name}`);
    }
    await StockMovement.create(
      [
        {
          businessId: new Types.ObjectId(input.businessId),
          shopId: new Types.ObjectId(input.sourceShopId),
          productId: product._id,
          type: "transfer",
          qtyChange: -input.quantity,
          prevStock: previous.currentStock,
          newStock: previous.currentStock - input.quantity,
          unitCost: product.avgCost,
          refType: "TRANSFER_OUT",
          refId: transfer._id,
          createdBy: new Types.ObjectId(userId),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: new Types.ObjectId(input.businessId),
          action: "TRANSFER_CREATED",
          ip: null,
          details: JSON.stringify({
            transferId: String(transfer._id),
            sourceShopId: input.sourceShopId,
            destShopId: input.destShopId,
            productId: String(product._id),
            quantity: input.quantity,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { transfer, duplicate: false };
  });

  return { transfer: toPublic(result.transfer), duplicate: result.duplicate };
}

export interface UpdateTransferStatusInput {
  businessId: string;
  shopId: string;
  transferId: string;
  status: "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
}

export async function updateTransferStatus(
  userId: string,
  input: UpdateTransferStatusInput
): Promise<{ transfer: ReturnType<typeof toPublic>; duplicate: boolean }> {
  await assertCanTransfer(userId, input.businessId, input.shopId);
  if (!Types.ObjectId.isValid(input.transferId)) throw ApiError.notFound("Transfer not found");
  if (!(STOCK_TRANSFER_STATUSES as readonly string[]).includes(input.status)) {
    throw ApiError.badRequest("Invalid transfer status");
  }

  const result = await withTransaction(async (session) => {
    const transfer = await StockTransfer.findOne({
      _id: new Types.ObjectId(input.transferId),
      businessId: new Types.ObjectId(input.businessId),
    }).session(session);
    if (!transfer) throw ApiError.notFound("Transfer not found");

    // Idempotent: already in the target state.
    if (transfer.status === input.status) return { transfer, duplicate: true };

    if (input.status === "RECEIVED") {
      if (transfer.status !== "PENDING" && transfer.status !== "IN_TRANSIT") {
        throw ApiError.badRequest("Only a PENDING or IN_TRANSIT transfer can be received");
      }
      // Destination shop: stock increment + transfer_in movement.
      const product = await Product.findOne({
        _id: transfer.productId,
        businessId: transfer.businessId,
      }).session(session);
      if (!product) throw ApiError.notFound("Product not found");
      const previous = await Product.findOneAndUpdate(
        { _id: product._id, businessId: product.businessId },
        { $inc: { currentStock: transfer.quantity } },
        { new: false, session: session ?? undefined }
      );
      if (!previous) throw ApiError.notFound("Product not found");
      await StockMovement.create(
        [
          {
            businessId: transfer.businessId,
            shopId: transfer.destShopId,
            productId: product._id,
            type: "transfer",
            qtyChange: transfer.quantity,
            prevStock: previous.currentStock,
            newStock: previous.currentStock + transfer.quantity,
            unitCost: product.avgCost,
            refType: "TRANSFER_IN",
            refId: transfer._id,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session: session ?? undefined, ordered: true }
      );
    } else if (input.status === "CANCELLED") {
      if (transfer.status === "RECEIVED") {
        throw ApiError.badRequest("A received transfer cannot be cancelled");
      }
      // Restore the source shop's stock (the transfer_out movement is reversed).
      const product = await Product.findOne({
        _id: transfer.productId,
        businessId: transfer.businessId,
      }).session(session);
      if (!product) throw ApiError.notFound("Product not found");
      const previous = await Product.findOneAndUpdate(
        { _id: product._id, businessId: product.businessId },
        { $inc: { currentStock: transfer.quantity } },
        { new: false, session: session ?? undefined }
      );
      if (!previous) throw ApiError.notFound("Product not found");
      await StockMovement.create(
        [
          {
            businessId: transfer.businessId,
            shopId: transfer.sourceShopId,
            productId: product._id,
            type: "transfer",
            qtyChange: transfer.quantity,
            prevStock: previous.currentStock,
            newStock: previous.currentStock + transfer.quantity,
            unitCost: product.avgCost,
            refType: "TRANSFER_CANCEL",
            refId: transfer._id,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session: session ?? undefined, ordered: true }
      );
    }

    transfer.status = input.status;
    await transfer.save({ session: session ?? undefined });

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: transfer.businessId,
          action: "TRANSFER_STATUS_CHANGED",
          ip: null,
          details: JSON.stringify({
            transferId: String(transfer._id),
            status: input.status,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { transfer, duplicate: false };
  });

  return { transfer: toPublic(result.transfer), duplicate: result.duplicate };
}

export interface ListTransfersQuery {
  page?: unknown;
  limit?: unknown;
  status?: unknown;
}

export async function listTransfers(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ListTransfersQuery = {}
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
  if (effectiveShopId) {
    filter.$or = [
      { sourceShopId: new Types.ObjectId(effectiveShopId) },
      { destShopId: new Types.ObjectId(effectiveShopId) },
    ];
  }
  if (typeof query.status === "string" && (STOCK_TRANSFER_STATUSES as readonly string[]).includes(query.status)) {
    filter.status = query.status;
  }

  const pagination = parsePagination(query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    StockTransfer.countDocuments(filter),
    StockTransfer.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  return { items: rows.map(toPublic), pagination: buildPagination(total, pagination) };
}