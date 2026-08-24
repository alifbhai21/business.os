import { Types } from "mongoose";
import { Product, ProductDocument, ProductStatus, ProductVariant } from "../models/Product";
import { Category } from "../models/Category";
import { Supplier } from "../models/Supplier";
import { ApiError } from "../utils/ApiError";
import { escapeRegExp, isDuplicateKeyError, membershipFor } from "./membership";
import { buildPagination, parsePagination } from "../utils/pagination";

export interface CreateProductInput {
  businessId: string;
  name: string;
  categoryId?: string | null;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  unit?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  wholesalePrice?: number;
  minPrice?: number;
  taxRate?: number;
  currentStock?: number;
  minStock?: number;
  maxStock?: number;
  preferredSupplierId?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  /** Phase 12 — catalog variants (S/M/L…); stock stays product-level. */
  variants?: ProductVariant[] | null;
  /** Phase 10 — offline-sync idempotency anchor. */
  localId?: string | null;
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: string | null;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  unit?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  wholesalePrice?: number;
  minPrice?: number;
  taxRate?: number;
  currentStock?: number;
  minStock?: number;
  maxStock?: number;
  preferredSupplierId?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  variants?: ProductVariant[] | null;
}

export interface ListProductsQuery {
  search?: string;
  categoryId?: string;
  lowStock?: string;
  status?: string;
  page?: number;
  limit?: number;
}

function toPublic(product: ProductDocument) {
  return {
    id: String(product._id),
    businessId: String(product.businessId),
    categoryId: product.categoryId ? String(product.categoryId) : null,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    brand: product.brand,
    unit: product.unit,
    purchasePrice: product.purchasePrice,
    sellingPrice: product.sellingPrice,
    wholesalePrice: product.wholesalePrice,
    minPrice: product.minPrice,
    taxRate: product.taxRate,
    currentStock: product.currentStock,
    minStock: product.minStock,
    maxStock: product.maxStock,
    avgCost: product.avgCost,
    preferredSupplierId: product.preferredSupplierId
      ? String(product.preferredSupplierId)
      : null,
    imageUrl: product.imageUrl,
    description: product.description,
    status: product.status,
    variants: (product.variants ?? []).map((v) => ({
      name: v.name,
      sku: v.sku,
      barcode: v.barcode,
      priceAdjustmentPaisa: v.priceAdjustmentPaisa ?? 0,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function roundPaisa(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value);
}

/**
 * Phase 12 — normalize the submitted variant list: reject case-insensitive
 * duplicate names within the product and variant barcodes that already exist
 * anywhere else in the business (variant or product barcodes share one
 * scanner namespace).
 */
async function normalizeVariants(
  businessId: string,
  variants?: ProductVariant[] | null
): Promise<ProductVariant[] | undefined> {
  if (variants === undefined) return undefined;
  const normalized = (variants ?? []).map((v) => ({
    name: v.name.trim(),
    sku: v.sku?.trim() || null,
    barcode: v.barcode?.trim() || null,
    priceAdjustmentPaisa: Math.round(v.priceAdjustmentPaisa ?? 0),
  }));

  const seen = new Set<string>();
  for (const v of normalized) {
    const key = v.name.toLowerCase();
    if (seen.has(key)) {
      throw ApiError.conflict(`Duplicate variant name "${v.name}"`);
    }
    seen.add(key);
  }

  const variantBarcodes = normalized.map((v) => v.barcode).filter((b): b is string => Boolean(b));
  if (variantBarcodes.length > 0) {
    const clash = await Product.findOne({
      businessId: new Types.ObjectId(businessId),
      $or: [
        { barcode: { $in: variantBarcodes } },
        { "variants.barcode": { $in: variantBarcodes } },
      ],
    })
      .select("name barcode variants")
      .lean();
    if (clash) {
      throw ApiError.conflict("A variant barcode already exists on another product in this business");
    }
  }

  return normalized;
}

async function assertRefsBelongToBusiness(
  businessId: Types.ObjectId,
  categoryId?: string | null,
  preferredSupplierId?: string | null
) {
  if (categoryId) {
    const category = await Category.findOne({
      _id: new Types.ObjectId(categoryId),
      businessId,
    });
    if (!category) throw ApiError.badRequest("categoryId does not belong to this business");
  }
  if (preferredSupplierId) {
    const supplier = await Supplier.findOne({
      _id: new Types.ObjectId(preferredSupplierId),
      businessId,
    });
    if (!supplier) throw ApiError.badRequest("preferredSupplierId does not belong to this business");
  }
}

export async function createProduct(userId: string, input: CreateProductInput) {
  const membership = await membershipFor(userId, input.businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const businessId = new Types.ObjectId(input.businessId);

  // Phase 10 offline-sync idempotency: the same localId never duplicates a row.
  if (input.localId) {
    const existing = await Product.findOne({ businessId, localId: input.localId });
    if (existing) return { ...toPublic(existing), duplicate: true };
  }

  await assertRefsBelongToBusiness(
    businessId,
    input.categoryId ?? null,
    input.preferredSupplierId ?? null
  );
  const variants = await normalizeVariants(input.businessId, input.variants);

  const purchasePrice = roundPaisa(input.purchasePrice) ?? 0;
  let product: ProductDocument;
  try {
    product = await Product.create({
      businessId,
      categoryId: input.categoryId ? new Types.ObjectId(input.categoryId) : null,
      name: input.name,
      sku: input.sku ?? null,
      barcode: input.barcode ?? null,
      brand: input.brand ?? null,
      unit: input.unit ?? "piece",
      purchasePrice,
      sellingPrice: roundPaisa(input.sellingPrice) ?? 0,
      wholesalePrice: roundPaisa(input.wholesalePrice) ?? 0,
      minPrice: roundPaisa(input.minPrice) ?? 0,
      taxRate: input.taxRate ?? 0,
      currentStock: input.currentStock ?? 0,
      minStock: input.minStock ?? 0,
      maxStock: input.maxStock ?? 0,
      avgCost: purchasePrice,
      preferredSupplierId: input.preferredSupplierId
        ? new Types.ObjectId(input.preferredSupplierId)
        : null,
      imageUrl: input.imageUrl ?? null,
      description: input.description ?? null,
      variants: variants ?? [],
      localId: input.localId ?? null,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      // A queued retry may have lost the race on the localId index.
      if (input.localId) {
        const existing = await Product.findOne({ businessId, localId: input.localId });
        if (existing) return { ...toPublic(existing), duplicate: true };
      }
      throw ApiError.conflict("A product with this barcode already exists in this business");
    }
    throw err;
  }
  return { ...toPublic(product), duplicate: false };
}

export async function listProducts(userId: string, businessId: string, query: ListProductsQuery) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  // mongoSanitize strips $-keys but can still leave a non-string (e.g. an
  // empty object from `?search[$ne]=`). Only a real string is searchable.
  const searchTerm = typeof query.search === "string" ? query.search : "";
  if (searchTerm) {
    const rx = new RegExp(escapeRegExp(searchTerm), "i");
    filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { brand: rx }];
  }
  if (query.categoryId) {
    filter.categoryId = new Types.ObjectId(query.categoryId);
  }
  if (query.lowStock === "true") {
    filter.$expr = { $lte: ["$currentStock", "$minStock"] };
  }
  if (query.status === "ACTIVE" || query.status === "INACTIVE") {
    filter.status = query.status;
  } else {
    filter.status = "ACTIVE";
  }

  const pagination = parsePagination(query as unknown as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
  ]);
  return {
    items: rows.map(toPublic),
    pagination: buildPagination(total, pagination),
  };
}

export async function getProduct(userId: string, businessId: string, productId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  // Malformed ids must read as "absent" (404), not surface as a CastError 500
  // — same contract as getPurchase in purchase.service.ts.
  if (!Types.ObjectId.isValid(productId)) throw ApiError.notFound("Product not found");
  const product = await Product.findOne({
    _id: new Types.ObjectId(productId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!product) throw ApiError.notFound("Product not found");
  return toPublic(product);
}

/**
 * Barcode lookup — exact match, business-scoped, covering BOTH product
 * barcodes and Phase 12 variant barcodes. The scanner only ever IDENTIFIES a
 * product: tenant scoping (membership), shop rules and RBAC stay exactly as
 * for any other product read. A matched variant rides along as
 * `matchedVariant` (top-level product shape preserved for existing clients).
 */
export async function getProductByBarcode(userId: string, businessId: string, barcode: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const product =
    (await Product.findOne({
      businessId: new Types.ObjectId(businessId),
      barcode,
    })) ??
    (await Product.findOne({
      businessId: new Types.ObjectId(businessId),
      "variants.barcode": barcode,
    }));
  if (!product) throw ApiError.notFound("Product not found");
  const matchedVariant =
    product.variants?.find((v) => v.barcode && v.barcode === barcode) ?? null;
  return {
    ...toPublic(product),
    matchedVariant: matchedVariant
      ? {
          name: matchedVariant.name,
          sku: matchedVariant.sku,
          priceAdjustmentPaisa: matchedVariant.priceAdjustmentPaisa,
        }
      : null,
  };
}

export async function updateProduct(
  userId: string,
  businessId: string,
  productId: string,
  input: UpdateProductInput
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.role !== "Owner" && membership.role !== "Admin" && membership.role !== "Manager") {
    throw ApiError.forbidden("Only Owner/Admin/Manager can update products");
  }
  const product = await Product.findOne({
    _id: new Types.ObjectId(productId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!product) throw ApiError.notFound("Product not found");

  await assertRefsBelongToBusiness(
    new Types.ObjectId(businessId),
    input.categoryId,
    input.preferredSupplierId
  );
  const variants = await normalizeVariants(businessId, input.variants);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.categoryId !== undefined)
    patch.categoryId = input.categoryId ? new Types.ObjectId(input.categoryId) : null;
  if (input.sku !== undefined) patch.sku = input.sku;
  if (input.barcode !== undefined) patch.barcode = input.barcode;
  if (input.brand !== undefined) patch.brand = input.brand;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.purchasePrice !== undefined) {
    const price = roundPaisa(input.purchasePrice)!;
    patch.purchasePrice = price;
    // Average cost seeds from the current purchase price until real purchases exist (Phase 05).
    patch.avgCost = price;
  }
  if (input.sellingPrice !== undefined) patch.sellingPrice = roundPaisa(input.sellingPrice);
  if (input.wholesalePrice !== undefined) patch.wholesalePrice = roundPaisa(input.wholesalePrice);
  if (input.minPrice !== undefined) patch.minPrice = roundPaisa(input.minPrice);
  if (input.taxRate !== undefined) patch.taxRate = input.taxRate;
  if (input.currentStock !== undefined) patch.currentStock = input.currentStock;
  if (input.minStock !== undefined) patch.minStock = input.minStock;
  if (input.maxStock !== undefined) patch.maxStock = input.maxStock;
  if (input.preferredSupplierId !== undefined)
    patch.preferredSupplierId = input.preferredSupplierId
      ? new Types.ObjectId(input.preferredSupplierId)
      : null;
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
  if (input.description !== undefined) patch.description = input.description;
  if (variants !== undefined) patch.variants = variants;

  Object.assign(product, patch);
  try {
    await product.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict("A product with this barcode already exists in this business");
    }
    throw err;
  }
  return toPublic(product);
}

export async function updateProductStatus(
  userId: string,
  businessId: string,
  productId: string,
  status: ProductStatus
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.role !== "Owner" && membership.role !== "Admin" && membership.role !== "Manager") {
    throw ApiError.forbidden("Only Owner/Admin/Manager can change product status");
  }
  const product = await Product.findOne({
    _id: new Types.ObjectId(productId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!product) throw ApiError.notFound("Product not found");
  product.status = status;
  await product.save();
  return toPublic(product);
}
