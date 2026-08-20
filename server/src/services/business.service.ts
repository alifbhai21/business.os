import { Types } from "mongoose";
import { Business, BusinessDocument, BusinessType } from "../models/Business";
import { BusinessMembership } from "../models/BusinessMembership";
import { ApiError } from "../utils/ApiError";
import { modulesForType, ModuleKey } from "../config/businessTypes";

export interface CreateBusinessInput {
  name: string;
  type: BusinessType;
  currency?: string;
  taxRate?: number;
  fiscalYear?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  allowNegativeStock?: boolean;
}

export interface UpdateBusinessInput {
  name?: string;
  type?: BusinessType;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  allowNegativeStock?: boolean;
}

export interface BusinessModules {
  businessId: string;
  type: BusinessType;
  modules: ModuleKey[];
}

function toPublic(business: BusinessDocument) {
  return {
    id: String(business._id),
    name: business.name,
    type: business.type,
    currency: business.currency,
    taxRate: business.taxRate,
    fiscalYear: business.fiscalYear,
    allowNegativeStock: business.allowNegativeStock,
    address: business.address,
    phone: business.phone,
    email: business.email,
    logo: business.logo,
    status: business.status,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
  };
}

async function membershipFor(userId: string, businessId: string) {
  return BusinessMembership.findOne({
    userId: new Types.ObjectId(userId),
    businessId: new Types.ObjectId(businessId),
    status: "ACTIVE",
  });
}

export async function createBusiness(userId: string, input: CreateBusinessInput) {
  const business = await Business.create({
    name: input.name,
    type: input.type,
    currency: input.currency ?? "BDT",
    taxRate: input.taxRate ?? 0,
    fiscalYear: input.fiscalYear ?? "1 July - 30 June",
    allowNegativeStock: input.allowNegativeStock ?? false,
    address: input.address ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
  });
  await BusinessMembership.create({
    userId: new Types.ObjectId(userId),
    businessId: business._id,
    role: "Owner",
    status: "ACTIVE",
  });
  return toPublic(business);
}

export async function listUserBusinesses(userId: string) {
  const memberships = await BusinessMembership.find({ userId: new Types.ObjectId(userId), status: "ACTIVE" });
  const ids = memberships.map((m) => m.businessId);
  const businesses = await Business.find({ _id: { $in: ids } });
  return businesses.map(toPublic);
}

export async function getBusinessForUser(userId: string, businessId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const business = await Business.findById(businessId);
  if (!business) throw ApiError.notFound("Business not found");
  return { business: toPublic(business), role: membership.role };
}

export async function updateBusinessForUser(userId: string, businessId: string, input: UpdateBusinessInput) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.role !== "Owner" && membership.role !== "Admin") {
    throw ApiError.forbidden("Only Owner/Admin can update business");
  }
  const business = await Business.findById(businessId);
  if (!business) throw ApiError.notFound("Business not found");
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.type !== undefined) patch.type = input.type;
  if (input.address !== undefined) patch.address = input.address;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.allowNegativeStock !== undefined) patch.allowNegativeStock = input.allowNegativeStock;
  Object.assign(business, patch);
  await business.save();
  return toPublic(business);
}

export async function getModulesForUser(userId: string, businessId: string): Promise<BusinessModules> {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const business = await Business.findById(businessId);
  if (!business) throw ApiError.notFound("Business not found");
  return {
    businessId: String(business._id),
    type: business.type,
    modules: modulesForType(business.type),
  };
}

export { toPublic as toBusinessPublic };