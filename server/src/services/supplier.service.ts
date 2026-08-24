import { Types } from "mongoose";
import { Supplier, SupplierDocument, SupplierStatus } from "../models/Supplier";
import { ApiError } from "../utils/ApiError";
import { escapeRegExp, isDuplicateKeyError, membershipFor } from "./membership";
import { buildPagination, parsePagination } from "../utils/pagination";

export interface CreateSupplierInput {
  businessId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  address?: string | null;
  openingBalance?: number;
  /** Phase 10 — offline-sync idempotency anchor. */
  localId?: string | null;
}

export interface UpdateSupplierInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  address?: string | null;
  openingBalance?: number;
}

export interface ListSuppliersQuery {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

function toPublic(supplier: SupplierDocument) {
  return {
    id: String(supplier._id),
    businessId: String(supplier.businessId),
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    company: supplier.company,
    address: supplier.address,
    openingBalance: supplier.openingBalance,
    currentPayable: supplier.currentPayable,
    status: supplier.status,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  };
}

function roundPaisa(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value);
}

export async function createSupplier(userId: string, input: CreateSupplierInput) {
  const membership = await membershipFor(userId, input.businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  // Phase 10 offline-sync idempotency: the same localId never duplicates a row.
  if (input.localId) {
    const existing = await Supplier.findOne({
      businessId: new Types.ObjectId(input.businessId),
      localId: input.localId,
    });
    if (existing) return { ...toPublic(existing), duplicate: true };
  }

  const openingBalance = roundPaisa(input.openingBalance) ?? 0;
  let supplier: SupplierDocument;
  try {
    supplier = await Supplier.create({
      businessId: new Types.ObjectId(input.businessId),
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      company: input.company ?? null,
      address: input.address ?? null,
      openingBalance,
      // Seed payable from the migrated opening balance (Phase 05+ updates it on purchases/payments).
      currentPayable: openingBalance,
      localId: input.localId ?? null,
    });
  } catch (err) {
    if (isDuplicateKeyError(err) && input.localId) {
      const existing = await Supplier.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      });
      if (existing) return { ...toPublic(existing), duplicate: true };
    }
    throw err;
  }
  return { ...toPublic(supplier), duplicate: false };
}

export async function listSuppliers(userId: string, businessId: string, query: ListSuppliersQuery) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (query.search) {
    const rx = new RegExp(escapeRegExp(query.search), "i");
    filter.$or = [{ name: rx }, { phone: rx }, { company: rx }];
  }
  if (query.status === "ACTIVE" || query.status === "INACTIVE") {
    filter.status = query.status;
  } else {
    filter.status = "ACTIVE";
  }

  const pagination = parsePagination(query as unknown as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    Supplier.countDocuments(filter),
    Supplier.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
  ]);
  return {
    items: rows.map(toPublic),
    pagination: buildPagination(total, pagination),
  };
}

export async function getSupplier(userId: string, businessId: string, supplierId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const supplier = await Supplier.findOne({
    _id: new Types.ObjectId(supplierId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!supplier) throw ApiError.notFound("Supplier not found");
  return toPublic(supplier);
}

export async function updateSupplier(
  userId: string,
  businessId: string,
  supplierId: string,
  input: UpdateSupplierInput
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (
    membership.role !== "Owner" &&
    membership.role !== "Admin" &&
    membership.role !== "Manager" &&
    membership.role !== "Accountant"
  ) {
    throw ApiError.forbidden("Insufficient role to update suppliers");
  }
  const supplier = await Supplier.findOne({
    _id: new Types.ObjectId(supplierId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!supplier) throw ApiError.notFound("Supplier not found");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.company !== undefined) patch.company = input.company;
  if (input.address !== undefined) patch.address = input.address;
  if (input.openingBalance !== undefined) {
    // Changing the opening balance shifts the current payable by the same delta.
    const next = roundPaisa(input.openingBalance)!;
    patch.openingBalance = next;
    patch.currentPayable = Math.max(0, supplier.currentPayable - supplier.openingBalance + next);
  }
  Object.assign(supplier, patch);
  await supplier.save();
  return toPublic(supplier);
}

export async function updateSupplierStatus(
  userId: string,
  businessId: string,
  supplierId: string,
  status: SupplierStatus
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (
    membership.role !== "Owner" &&
    membership.role !== "Admin" &&
    membership.role !== "Manager" &&
    membership.role !== "Accountant"
  ) {
    throw ApiError.forbidden("Insufficient role to change supplier status");
  }
  const supplier = await Supplier.findOne({
    _id: new Types.ObjectId(supplierId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!supplier) throw ApiError.notFound("Supplier not found");
  supplier.status = status;
  await supplier.save();
  return toPublic(supplier);
}
