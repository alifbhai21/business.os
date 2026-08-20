import { Types } from "mongoose";
import { Category, CategoryDocument, CategoryStatus } from "../models/Category";
import { ApiError } from "../utils/ApiError";
import { escapeRegExp, isDuplicateKeyError, membershipFor } from "./membership";
import { parsePagination, buildPagination } from "../utils/pagination";

export interface CreateCategoryInput {
  businessId: string;
  name: string;
  description?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null;
}

function toPublic(category: CategoryDocument) {
  return {
    id: String(category._id),
    businessId: String(category.businessId),
    name: category.name,
    description: category.description,
    status: category.status,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

export async function createCategory(userId: string, input: CreateCategoryInput) {
  const membership = await membershipFor(userId, input.businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  let category: CategoryDocument;
  try {
    category = await Category.create({
      businessId: new Types.ObjectId(input.businessId),
      name: input.name,
      description: input.description ?? null,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict("A category with this name already exists in this business");
    }
    throw err;
  }
  return toPublic(category);
}

export async function listCategories(
  userId: string,
  businessId: string,
  query: { search?: string; status?: string; page?: number; limit?: number }
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (query.search) {
    const rx = new RegExp(escapeRegExp(query.search), "i");
    filter.name = rx;
  }
  if (query.status === "ACTIVE" || query.status === "INACTIVE") {
    filter.status = query.status;
  } else {
    filter.status = "ACTIVE";
  }

  const pagination = parsePagination(query as unknown as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    Category.countDocuments(filter),
    Category.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);
  return {
    items: rows.map(toPublic),
    pagination: buildPagination(total, pagination),
  };
}

export async function getCategory(userId: string, businessId: string, categoryId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  const category = await Category.findOne({
    _id: new Types.ObjectId(categoryId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!category) throw ApiError.notFound("Category not found");
  return toPublic(category);
}

export async function updateCategory(
  userId: string,
  businessId: string,
  categoryId: string,
  input: UpdateCategoryInput
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.role !== "Owner" && membership.role !== "Admin" && membership.role !== "Manager") {
    throw ApiError.forbidden("Only Owner/Admin/Manager can update categories");
  }
  const category = await Category.findOne({
    _id: new Types.ObjectId(categoryId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!category) throw ApiError.notFound("Category not found");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  Object.assign(category, patch);
  try {
    await category.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict("A category with this name already exists in this business");
    }
    throw err;
  }
  return toPublic(category);
}

export async function updateCategoryStatus(
  userId: string,
  businessId: string,
  categoryId: string,
  status: CategoryStatus
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.role !== "Owner" && membership.role !== "Admin" && membership.role !== "Manager") {
    throw ApiError.forbidden("Only Owner/Admin/Manager can change category status");
  }
  const category = await Category.findOne({
    _id: new Types.ObjectId(categoryId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!category) throw ApiError.notFound("Category not found");
  category.status = status;
  await category.save();
  return toPublic(category);
}
