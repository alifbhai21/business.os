import { Types } from "mongoose";
import { Employee, EmployeeDocument } from "../models/Employee";
import { BusinessMembership } from "../models/BusinessMembership";
import { User } from "../models/User";
import { Shop } from "../models/Shop";
import { AuditLog } from "../models/AuditLog";
import { membershipFor, isDuplicateKeyError } from "./membership";
import { ApiError } from "../utils/ApiError";
import { parsePagination, buildPagination } from "../utils/pagination";
import {
  isValidRole,
  isValidPermission,
  permissionsForRole,
} from "../config/roles";

/**
 * Phase 09 — Employees, roles & permissions.
 *
 * Server-authoritative rules:
 * - Only Owner/Admin/Manager may manage employees; only Owner/Admin may
 *   assign roles or change a member's permissions (privilege-escalation guard).
 * - The business Owner's own record/membership can never be demoted,
 *   suspended or removed through this API.
 * - A shop-pinned manager can only manage employees of their own shop.
 * - Employees are soft-removed (status REMOVED) and their membership is
 *   suspended — never hard-deleted (audit trail).
 */

const MANAGE_ROLES = ["Owner", "Admin", "Manager"];
const ASSIGN_ROLES = ["Owner", "Admin"];

function toPublic(employee: EmployeeDocument) {
  return {
    id: String(employee._id),
    businessId: String(employee.businessId),
    shopId: employee.shopId ? String(employee.shopId) : null,
    userId: employee.userId ? String(employee.userId) : null,
    name: employee.name,
    phone: employee.phone,
    role: employee.role,
    status: employee.status,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

async function assertManageAccess(
  userId: string,
  businessId: string,
  shopId: string | null | undefined
) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (!MANAGE_ROLES.includes(membership.role)) {
    throw ApiError.forbidden("Only Owner/Admin/Manager can manage employees");
  }
  // Shop-pinned members are locked to their own shop.
  let effectiveShopId = shopId ?? null;
  if (membership.shopId) {
    if (effectiveShopId && effectiveShopId !== String(membership.shopId)) {
      throw ApiError.notFound("Shop not found");
    }
    effectiveShopId = String(membership.shopId);
  }
  if (effectiveShopId) {
    const shop = await Shop.findOne({
      _id: new Types.ObjectId(effectiveShopId),
      businessId: new Types.ObjectId(businessId),
    });
    if (!shop) throw ApiError.notFound("Shop not found");
  }
  return { membership, effectiveShopId };
}

async function assertAssignAccess(userId: string, businessId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (!ASSIGN_ROLES.includes(membership.role)) {
    throw ApiError.forbidden("Only Owner/Admin can assign roles");
  }
  return membership;
}

async function writeAudit(
  action: string,
  actorUserId: string,
  businessId: string,
  shopId: string | null,
  recordId: string,
  details: Record<string, unknown>
) {
  await AuditLog.create([
    {
      userId: new Types.ObjectId(actorUserId),
      businessId: new Types.ObjectId(businessId),
      shopId: shopId ? new Types.ObjectId(shopId) : null,
      action,
      recordId,
      details: JSON.stringify(details),
    },
  ]);
}

/** Create/update the linked user's BusinessMembership to match the employee record. */
async function syncMembership(
  businessId: string,
  shopId: string | null,
  linkedUserId: string,
  role: string,
  status: "ACTIVE" | "INVITED" | "SUSPENDED",
  extraPermissions?: string[]
) {
  const existing = await BusinessMembership.findOne({
    userId: new Types.ObjectId(linkedUserId),
    businessId: new Types.ObjectId(businessId),
  });
  const permissions = [
    ...new Set([...permissionsForRole(role), ...(extraPermissions ?? [])]),
  ] as string[];
  if (existing) {
    existing.role = role as typeof existing.role;
    existing.shopId = shopId ? new Types.ObjectId(shopId) : existing.shopId;
    existing.status = status;
    existing.permissions = permissions;
    await existing.save();
    return existing;
  }
  return BusinessMembership.create({
    userId: new Types.ObjectId(linkedUserId),
    businessId: new Types.ObjectId(businessId),
    shopId: shopId ? new Types.ObjectId(shopId) : null,
    role,
    status,
    permissions,
  });
}

export interface CreateEmployeeInput {
  businessId: string;
  shopId?: string | null;
  name: string;
  phone: string;
  role: string;
}

export async function createEmployee(actorUserId: string, input: CreateEmployeeInput) {
  const { effectiveShopId } = await assertManageAccess(
    actorUserId,
    input.businessId,
    input.shopId
  );
  if (!isValidRole(input.role)) throw ApiError.badRequest("Invalid role");

  // Invite = link an existing account by phone when one exists.
  const linkedUser = await User.findOne({ phone: input.phone });
  if (linkedUser) {
    // Never create a second Owner membership via invites.
    if (input.role === "Owner") {
      throw ApiError.badRequest("Cannot invite another Owner");
    }
  }

  let employee: EmployeeDocument;
  try {
    employee = await Employee.create({
      businessId: new Types.ObjectId(input.businessId),
      shopId: effectiveShopId ? new Types.ObjectId(effectiveShopId) : null,
      userId: linkedUser ? linkedUser._id : null,
      name: input.name,
      phone: input.phone,
      role: input.role,
      status: linkedUser ? "ACTIVE" : "INVITED",
      invitedBy: new Types.ObjectId(actorUserId),
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict("An employee with this phone already exists in this business");
    }
    throw err;
  }

  if (linkedUser) {
    await syncMembership(input.businessId, effectiveShopId, String(linkedUser._id), input.role, "ACTIVE");
  }

  await writeAudit(
    linkedUser ? "EMPLOYEE_CREATED" : "EMPLOYEE_INVITED",
    actorUserId,
    input.businessId,
    effectiveShopId,
    String(employee._id),
    { name: input.name, phone: input.phone, role: input.role, linked: Boolean(linkedUser) }
  );

  return toPublic(employee);
}

export interface ListEmployeesQuery {
  businessId: string;
  shopId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listEmployees(actorUserId: string, query: ListEmployeesQuery) {
  const { effectiveShopId } = await assertManageAccess(
    actorUserId,
    query.businessId,
    query.shopId ?? undefined
  );
  const pagination = parsePagination(query as unknown as Record<string, unknown>);
  const filter: Record<string, unknown> = {
    businessId: new Types.ObjectId(query.businessId),
  };
  if (effectiveShopId) filter.shopId = new Types.ObjectId(effectiveShopId);
  if (query.status) filter.status = query.status;

  const [total, employees] = await Promise.all([
    Employee.countDocuments(filter),
    Employee.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  return {
    data: employees.map(toPublic),
    pagination: buildPagination(total, pagination),
  };
}

export interface UpdateEmployeeInput {
  businessId: string;
  shopId?: string | null;
  name?: string;
  phone?: string;
  role?: string;
  status?: "ACTIVE" | "INVITED" | "SUSPENDED";
}

export async function updateEmployee(
  actorUserId: string,
  employeeId: string,
  input: UpdateEmployeeInput
) {
  const { effectiveShopId } = await assertManageAccess(
    actorUserId,
    input.businessId,
    input.shopId ?? undefined
  );
  if (!Types.ObjectId.isValid(employeeId)) throw ApiError.notFound("Employee not found");

  const employee = await Employee.findOne({
    _id: new Types.ObjectId(employeeId),
    businessId: new Types.ObjectId(input.businessId),
  });
  if (!employee || employee.status === "REMOVED") throw ApiError.notFound("Employee not found");

  // Role changes are restricted to Owner/Admin.
  if (input.role !== undefined && input.role !== employee.role) {
    await assertAssignAccess(actorUserId, input.businessId);
    if (!isValidRole(input.role)) throw ApiError.badRequest("Invalid role");
    if (employee.role === "Owner") {
      throw ApiError.forbidden("The business Owner's role cannot be changed");
    }
    if (input.role === "Owner") {
      throw ApiError.badRequest("Cannot promote another member to Owner");
    }
  }

  // Status/suspension changes are also Owner/Admin only (Manager manages data, not access).
  if (input.status !== undefined && input.status !== employee.status) {
    await assertAssignAccess(actorUserId, input.businessId);
    if (employee.role === "Owner") {
      throw ApiError.forbidden("The business Owner cannot be suspended");
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.role !== undefined) patch.role = input.role;
  if (input.status !== undefined) patch.status = input.status;
  if (input.shopId !== undefined) patch.shopId = effectiveShopId ? new Types.ObjectId(effectiveShopId) : null;

  Object.assign(employee, patch);
  try {
    await employee.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict("An employee with this phone already exists in this business");
    }
    throw err;
  }

  // Keep the linked membership in step.
  if (employee.userId) {
    const membershipStatus =
      employee.status === "ACTIVE" ? "ACTIVE" : employee.status === "SUSPENDED" ? "SUSPENDED" : "INVITED";
    await syncMembership(
      input.businessId,
      employee.shopId ? String(employee.shopId) : null,
      String(employee.userId),
      employee.role,
      membershipStatus
    );
  }

  await writeAudit(
    "EMPLOYEE_UPDATED",
    actorUserId,
    input.businessId,
    employee.shopId ? String(employee.shopId) : null,
    String(employee._id),
    { changes: patch }
  );

  return toPublic(employee);
}

export async function removeEmployee(
  actorUserId: string,
  businessId: string,
  employeeId: string
) {
  await assertManageAccess(actorUserId, businessId, undefined);
  if (!Types.ObjectId.isValid(employeeId)) throw ApiError.notFound("Employee not found");

  const employee = await Employee.findOne({
    _id: new Types.ObjectId(employeeId),
    businessId: new Types.ObjectId(businessId),
  });
  if (!employee) throw ApiError.notFound("Employee not found");
  if (employee.role === "Owner") {
    throw ApiError.forbidden("The business Owner cannot be removed");
  }
  if (employee.status === "REMOVED") {
    return { ...toPublic(employee), duplicate: true }; // idempotent re-remove
  }

  employee.status = "REMOVED";
  await employee.save();

  if (employee.userId) {
    await BusinessMembership.updateOne(
      { userId: employee.userId, businessId: new Types.ObjectId(businessId) },
      { $set: { status: "SUSPENDED" } }
    );
  }

  await writeAudit("EMPLOYEE_REMOVED", actorUserId, businessId, employee.shopId ? String(employee.shopId) : null, String(employee._id), {
    name: employee.name,
    phone: employee.phone,
    role: employee.role,
  });

  return { ...toPublic(employee), duplicate: false };
}

// ── Roles ────────────────────────────────────────────────────

export interface AssignRoleInput {
  businessId: string;
  employeeId: string;
  role: string;
  permissions?: string[];
}

export async function assignRole(actorUserId: string, input: AssignRoleInput) {
  await assertAssignAccess(actorUserId, input.businessId);
  if (!isValidRole(input.role)) throw ApiError.badRequest("Invalid role");
  if (input.permissions) {
    for (const p of input.permissions) {
      if (!isValidPermission(p)) throw ApiError.badRequest(`Unknown permission: ${p}`);
    }
  }
  if (!Types.ObjectId.isValid(input.employeeId)) throw ApiError.notFound("Employee not found");

  const employee = await Employee.findOne({
    _id: new Types.ObjectId(input.employeeId),
    businessId: new Types.ObjectId(input.businessId),
  });
  if (!employee || employee.status === "REMOVED") throw ApiError.notFound("Employee not found");
  if (employee.role === "Owner") {
    throw ApiError.forbidden("The business Owner's role cannot be changed");
  }
  if (input.role === "Owner") {
    throw ApiError.badRequest("Cannot promote another member to Owner");
  }

  const previousRole = employee.role;
  employee.role = input.role;
  await employee.save();

  if (employee.userId) {
    await syncMembership(
      input.businessId,
      employee.shopId ? String(employee.shopId) : null,
      String(employee.userId),
      input.role,
      employee.status === "ACTIVE" ? "ACTIVE" : employee.status === "SUSPENDED" ? "SUSPENDED" : "INVITED",
      input.permissions
    );
  }

  await writeAudit("ROLE_ASSIGNED", actorUserId, input.businessId, employee.shopId ? String(employee.shopId) : null, String(employee._id), {
    employeeId: String(employee._id),
    previousRole,
    newRole: input.role,
    permissions: input.permissions ?? null,
  });

  return toPublic(employee);
}