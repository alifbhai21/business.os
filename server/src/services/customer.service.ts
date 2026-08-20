import { Types } from "mongoose";
import { Customer, CustomerDocument, CustomerStatus } from "../models/Customer";
import { ApiError } from "../utils/ApiError";
import { escapeRegExp, membershipFor } from "./membership";
import { buildPagination, parsePagination } from "../utils/pagination";

export interface CreateCustomerInput {
  businessId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  customerCode?: string | null;
  openingBalance?: number;
  creditLimit?: number;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  customerCode?: string | null;
  openingBalance?: number;
  creditLimit?: number;
}

export interface ListCustomersQuery {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

function toPublic(customer: CustomerDocument) {
  return {
    id: String(customer._id),
    businessId: String(customer.businessId),
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    customerCode: customer.customerCode,
    openingBalance: customer.openingBalance,
    creditLimit: customer.creditLimit,
    currentDue: customer.currentDue,
    status: customer.status,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

function roundPaisa(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value);
}

export async function createCustomer(userId: string, input: CreateCustomerInput) {
  const membership = await membershipFor(userId, input.businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const openingBalance = roundPaisa(input.openingBalance) ?? 0;
  const customer = await Customer.create({
    businessId: new Types.ObjectId(input.businessId),
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    customerCode: input.customerCode ?? null,
    openingBalance,
    creditLimit: roundPaisa(input.creditLimit) ?? 0,
    // Seed due from the migrated opening balance (Phase 05+ updates it on sales/payments).
    currentDue: openingBalance,
  });
  return toPublic(customer);
}

export async function listCustomers(userId: string, businessId: string, query: ListCustomersQuery) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (query.search) {
    const rx = new RegExp(escapeRegExp(query.search), "i");
    filter.$or = [{ name: rx }, { phone: rx }, { customerCode: rx }];
  }
  if (query.status === "ACTIVE" || query.status === "INACTIVE") {
    filter.status = query.status;
  } else {
    filter.status = "ACTIVE";
  }

  const pagination = parsePagination(query as unknown as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    Customer.countDocuments(filter),
    Customer.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
  ]);
  return {
    items: rows.map(toPublic),
    pagination: buildPagination(total, pagination),
  };
}

export async function getCustomer(userId: string, businessId: string, customerId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const customer = await Customer.findOne({
    _id: new Types.ObjectId(customerId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!customer) throw ApiError.notFound("Customer not found");
  return toPublic(customer);
}

export async function updateCustomer(
  userId: string,
  businessId: string,
  customerId: string,
  input: UpdateCustomerInput
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (
    membership.role !== "Owner" &&
    membership.role !== "Admin" &&
    membership.role !== "Manager" &&
    membership.role !== "Accountant" &&
    membership.role !== "Salesperson"
  ) {
    throw ApiError.forbidden("Insufficient role to update customers");
  }
  const customer = await Customer.findOne({
    _id: new Types.ObjectId(customerId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!customer) throw ApiError.notFound("Customer not found");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.address !== undefined) patch.address = input.address;
  if (input.customerCode !== undefined) patch.customerCode = input.customerCode;
  if (input.creditLimit !== undefined) patch.creditLimit = roundPaisa(input.creditLimit);
  if (input.openingBalance !== undefined) {
    // Changing the opening balance shifts the current due by the same delta.
    const next = roundPaisa(input.openingBalance)!;
    patch.openingBalance = next;
    patch.currentDue = Math.max(0, customer.currentDue - customer.openingBalance + next);
  }
  Object.assign(customer, patch);
  await customer.save();
  return toPublic(customer);
}

export async function updateCustomerStatus(
  userId: string,
  businessId: string,
  customerId: string,
  status: CustomerStatus
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (
    membership.role !== "Owner" &&
    membership.role !== "Admin" &&
    membership.role !== "Manager" &&
    membership.role !== "Accountant" &&
    membership.role !== "Salesperson"
  ) {
    throw ApiError.forbidden("Insufficient role to change customer status");
  }
  const customer = await Customer.findOne({
    _id: new Types.ObjectId(customerId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!customer) throw ApiError.notFound("Customer not found");
  customer.status = status;
  await customer.save();
  return toPublic(customer);
}
